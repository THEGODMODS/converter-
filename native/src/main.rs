use std::{env, fs, io::Cursor, path::{Path,PathBuf}, process, sync::{Arc,Mutex}, time::{SystemTime,UNIX_EPOCH}};
use crossbeam_channel::unbounded;
use studio_core::{AppPaths,PipelineEvent,Settings,ShellRequest,StudioTool,ToolContext};
use team_compiler::Tool as TeamCompilerTool;
mod package_policy;
mod cpk_extract;
use package_policy::{ftex_target_path, normalize_fox_virtual_path, validate_face_package_members};
use fmdl::{format::{FmdlFile,SklFile}, ops::paths::rewrite_texture_paths, Model as FoxModel};
use pes_model::{format::{PreFoxModel,mtl::MaterialSet}, model::Model as PreFoxSemanticModel};
use model_convert::{convert, NativeModelBundle, Subject};
use fpk::FpkFile;
use wezlib::decompress_if_wrapped;
use ftex::{ColorSpace,dds_to_ftex,ftex_to_dds,info as ftex_info};

fn required(args:&[String], name:&str)->Result<String,String>{let i=args.iter().position(|x|x==name).ok_or_else(||format!("Missing required argument {name}"))?;args.get(i+1).cloned().ok_or_else(||format!("Missing value for {name}"))}
fn optional(args:&[String],name:&str)->Option<String>{args.iter().position(|x|x==name).and_then(|i|args.get(i+1)).cloned()}
fn write(path:&Path,bytes:&[u8])->Result<(),String>{if let Some(parent)=path.parent(){fs::create_dir_all(parent).map_err(|e|format!("Create output directory: {e}"))?;}fs::write(path,bytes).map_err(|e|format!("Write {}: {e}",path.display()))}
fn replace_texture_extension(value:&mut String,from:&str,to:&str)->Result<(),String>{
 let (stem,extension)=value.rsplit_once('.').ok_or_else(||format!("Texture reference has no file extension: {value}"))?;
 if !extension.eq_ignore_ascii_case(from){return Err(format!("Texture reference has unexpected source extension: {value} (expected .{from})"));}
 *value=format!("{stem}.{to}");Ok(())
}

/// Wraps a validated FACE calibration payload in the legacy PES XML <dif>
/// element. Real upstream v4/v5 samples are preserved byte-for-byte across
/// package formats; no unverified rig-space transform is applied.
fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let a = chunk[0] as u32;
        let b = *chunk.get(1).unwrap_or(&0) as u32;
        let c = *chunk.get(2).unwrap_or(&0) as u32;
        let value = (a << 16) | (b << 8) | c;
        out.push(TABLE[((value >> 18) & 63) as usize] as char);
        out.push(TABLE[((value >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 { TABLE[((value >> 6) & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[(value & 63) as usize] as char } else { '=' });
    }
    out
}

fn decode_base64(value: &str) -> Result<Vec<u8>, String> {
    let compact: Vec<u8> = value.bytes().filter(|byte| !byte.is_ascii_whitespace()).collect();
    if compact.len() % 4 != 0 {
        return Err("Legacy face XML <dif> payload has invalid Base64 length.".into());
    }
    let digit = |byte: u8| -> Option<u8> {
        match byte {
            b'A'..=b'Z' => Some(byte - b'A'),
            b'a'..=b'z' => Some(byte - b'a' + 26),
            b'0'..=b'9' => Some(byte - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    };
    let mut output = Vec::with_capacity(compact.len() / 4 * 3);
    for (index, chunk) in compact.chunks_exact(4).enumerate() {
        let last = index + 1 == compact.len() / 4;
        let a = digit(chunk[0]).ok_or("Legacy face XML <dif> payload contains invalid Base64.")?;
        let b = digit(chunk[1]).ok_or("Legacy face XML <dif> payload contains invalid Base64.")?;
        let c = if chunk[2] == b'=' { None } else { Some(digit(chunk[2]).ok_or("Legacy face XML <dif> payload contains invalid Base64.")?) };
        let d = if chunk[3] == b'=' { None } else { Some(digit(chunk[3]).ok_or("Legacy face XML <dif> payload contains invalid Base64.")?) };
        if !last && (c.is_none() || d.is_none()) || c.is_none() && d.is_some() {
            return Err("Legacy face XML <dif> payload has invalid Base64 padding.".into());
        }
        output.push((a << 2) | (b >> 4));
        if let Some(c) = c {
            output.push((b << 4) | (c >> 2));
            if let Some(d) = d {
                output.push((c << 6) | d);
            }
        }
    }
    Ok(output)
}

/// Validate a FACE payload without assuming that its auxiliary record layout is
/// generation-exclusive. The upstream Team compiler preserves real v4/v5 payloads
/// across pre-Fox and Fox package builds; unknown record families remain opaque here.
fn validate_face_diff_payload(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < 0x50 || &bytes[..4] != b"FACE" {
        return Err("FACE diff has an invalid or truncated header.".into());
    }
    let version = u32::from_le_bytes(bytes[4..8].try_into().unwrap());
    if !(4..=6).contains(&version) {
        return Err(format!("Unsupported FACE diff version {version}; supported versions are 4, 5 and 6."));
    }
    let count_a = u32::from_le_bytes(bytes[0x48..0x4c].try_into().unwrap()) as usize;
    let count_b = u32::from_le_bytes(bytes[0x4c..0x50].try_into().unwrap()) as usize;
    if count_a > 64 || count_b > 16 {
        return Err("FACE diff declares an unreasonable number of auxiliary records.".into());
    }
    let offset_count = count_a.checked_add(count_b).ok_or("FACE diff record count overflow.")?;
    let table_end = 0x50usize.checked_add(offset_count.checked_mul(4).ok_or("FACE diff pointer table overflow.")?)
        .ok_or("FACE diff pointer table overflow.")?;
    if table_end > 0xf0 {
        return Err("FACE diff record-offset table exceeds its fixed header.".into());
    }    let required = 0xf0usize.checked_add(count_a.checked_mul(0x10).ok_or("FACE diff record size overflow.")?)
        .and_then(|v| v.checked_add(count_b.checked_mul(0x20)?))
        .ok_or("FACE diff record size overflow.")?;
    if bytes.len() < required {
        return Err(format!("FACE diff is truncated: {} bytes, expected at least {required}.", bytes.len()));
    }
    for at in (0x08..0x48).step_by(4) {
        let value = f32::from_le_bytes(bytes[at..at + 4].try_into().unwrap());
        if !value.is_finite() {
            return Err("FACE diff header contains a non-finite calibration value.".into());
        }
    }
    let mut seen = std::collections::HashSet::new();
    let mut offsets = Vec::with_capacity(offset_count);
    for index in 0..offset_count {
        let at = 0x50 + index * 4;
        let offset = u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap()) as usize;
        if offset < 0xf0 || offset % 16 != 0 || offset.checked_add(4).is_none_or(|end| end > bytes.len()) || !seen.insert(offset) {
            return Err(format!("FACE diff record pointer {index} is invalid, unaligned, out of range or duplicated."));
        }
        let value = f32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap());
        if !value.is_finite() {
            return Err(format!("FACE diff record {index} contains a non-finite value."));
        }
        offsets.push(offset);
    }
    // Real fixtures establish three layouts: v4 (32 + 6), v5 (32 + 6,
    // where the first second-block entry is 16 bytes), and v5 (33 + 6).
    // Do not impose guessed record extents on uncharacterized versions.
    let v4_layout = version == 4 && count_a == 32 && count_b == 6;
    let v5_full_layout = version == 5 && count_a == 33 && count_b == 6;
    let v5_split_layout = version == 5
        && count_a == 32
        && count_b == 6
        && offsets.get(count_a + 1).zip(offsets.get(count_a))
            .is_some_and(|(next, first)| next.saturating_sub(*first) == 0x10);
    if v4_layout || v5_full_layout || v5_split_layout {
        let mut ranges = Vec::with_capacity(offset_count);
        for (index, offset) in offsets.iter().copied().enumerate() {
            let split_extra_bone = v5_split_layout && index == count_a;
            let size = if index < count_a || split_extra_bone { 0x10 } else { 0x20 };
            let end = offset.checked_add(size).ok_or("FACE diff record range overflow.")?;
            if end > bytes.len() {
                return Err(format!("FACE diff record {index} exceeds the file boundary."));
            }
            for at in (offset..end).step_by(4) {
                let value = f32::from_le_bytes(bytes[at..at + 4].try_into().unwrap());
                if !value.is_finite() {
                    return Err(format!("FACE diff record {index} contains a non-finite value."));
                }
            }
            ranges.push((offset, end));
        }
        ranges.sort_unstable_by_key(|range| range.0);
        for pair in ranges.windows(2) {
            if pair[1].0 < pair[0].1 {
                return Err("FACE diff records overlap.".into());
            }
        }
    }
    Ok(())
}

/// Validate supported FACE payload structure without rewriting its versioned records.
/// PES 2021 retains the legacy v4 eye path, and the pinned Team Compiler transports
/// v5/v6 payloads into pre-Fox XML. This is byte-preserving transport, not rig retargeting.
fn validate_face_diff_generation(bytes: &[u8], target: u16) -> Result<(), String> {
    validate_face_diff_payload(bytes)?;
    let version = u32::from_le_bytes(bytes[4..8].try_into().unwrap());
    match target {
        2017 if version == 4 => Ok(()),
        2021 if version == 4 || version == 5 || version == 6 => Ok(()),
        2017 => Err(format!("PES 2017 requires FACE diff v4; source v{version} cannot be copied safely.")),
        2021 => Err(format!("PES 2021 supports FACE diff v4/v5/v6; source v{version} is not supported.")),
        _ => Err(format!("Unsupported target PES generation: {target}.")),
    }
}

fn legacy_face_diff_from_xml(bytes: &[u8]) -> Result<Option<Vec<u8>>, String> {
    let text = std::str::from_utf8(bytes).map_err(|_| "Legacy face.xml is not UTF-8.")?;
    let document = roxmltree::Document::parse(text).map_err(|error| format!("Legacy face.xml is malformed: {error}"))?;
    let diffs: Vec<_> = document.descendants().filter(|node| node.is_element() && node.tag_name().name() == "dif").collect();
    if diffs.len() > 1 {
        return Err("Legacy face.xml contains more than one <dif> element.".into());
    }
    let Some(diff) = diffs.first() else { return Ok(None); };
    if diff.children().any(|child| child.is_element()) {
        return Err("Legacy face.xml <dif> must contain Base64 text only.".into());
    }
    let payload = diff.children().filter_map(|child| child.text()).collect::<String>();
    if payload.trim().is_empty() {
        return Err("Legacy face.xml <dif> is empty.".into());
    }
    Ok(Some(decode_base64(&payload)?))
}

fn legacy_face_xml(face_diff: Option<&[u8]>, model_stems: &[String]) -> Result<Vec<u8>, String> {
    if let Some(face_diff) = face_diff {
        validate_face_diff_payload(face_diff)?;
    }    let has_face = model_stems.iter().any(|s| s.eq_ignore_ascii_case("face_high"));
    if !has_face {
        return Err("A legacy face XML requires a face_high model.".into());
    }
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<config>\n");
    for stem in model_stems {
        let kind = if stem.eq_ignore_ascii_case("face_high") {
            "face_neck"
        } else if stem.eq_ignore_ascii_case("hair_high") || stem.eq_ignore_ascii_case("oral") || stem.eq_ignore_ascii_case("oral_high") {
            "parts"
        } else {
            return Err(format!("Cannot safely assign legacy PES XML model type for '{stem}'."));
        };
        let model_name = format!("oral_{stem}_*.model");
        let material = format!("{stem}.mtl");
        xml.push_str(&format!("  <model level=\"0\" type=\"{kind}\" path=\"./{model_name}\" material=\"./{material}\"/>\n"));
    }
    if let Some(face_diff) = face_diff {
        xml.push_str("  <dif>");
        xml.push_str(&base64_encode(face_diff));
        xml.push_str("</dif>\n");
    }
    xml.push_str("</config>\n");
    Ok(xml.into_bytes())
}

struct TempWorkspace(PathBuf);
impl Drop for TempWorkspace {
    fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); }
}

fn create_temp_workspace() -> Result<TempWorkspace, String> {
    let parent = env::temp_dir();
    for attempt in 0..16u8 {
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
        let path = parent.join(format!("face-forge-team-{}-{nonce}-{attempt}", process::id()));
        match fs::create_dir(&path) {
            Ok(()) => return Ok(TempWorkspace(path)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Create temporary Team compiler workspace: {error}")),
        }
    }
    Err("Could not allocate a unique temporary Team compiler workspace.".into())
}

fn is_face_archive_extension(extension: &str) -> bool {
    matches!(extension, "fpk" | "fpkd" | "kpfd")
}

/// Rewrite the two legacy Fox texture spellings that the upstream Team Compiler
/// deliberately rejects in Studio exports. This is a lossless path-table edit:
/// geometry, skinning, materials and mesh records remain unchanged.
fn normalize_fox_texture_reference(directory: &mut String, file_name: &mut String) {
    const COMMON: &str = "/model/character/common/";
    if let Some(at) = directory.to_ascii_lowercase().find(COMMON) {
        let end = at + COMMON.len();
        let (head, tail) = directory.split_at(end);
        if let Some((segment, rest)) = tail.split_once('/') {
            if !segment.eq_ignore_ascii_case("sourceimages")
                && !segment.eq_ignore_ascii_case("team_folder")
            {
                *directory = format!("{head}team_folder/{rest}");
            }
        }
    }

    let (stem, extension) = file_name
        .rsplit_once('.')
        .map(|(stem, extension)| (stem, format!(".{extension}")))
        .unwrap_or((file_name.as_str(), String::new()));
    let folded = stem.to_ascii_lowercase();
    if folded == "dummy_kit"
        || folded.starts_with("dummy_kit_")
        || folded == "dummy_gk_kit"
        || folded.starts_with("dummy_gk_kit_")
    {
        *file_name = format!("team_{}{extension}", &folded["dummy_".len()..]);
    }
}

fn normalize_fox_face_model_paths(root: &Path) -> Result<usize, String> {
    fn walk(root: &Path, changed_total: &mut usize) -> Result<(), String> {
        for entry in fs::read_dir(root).map_err(|e| format!("Read staged face folder {}: {e}", root.display()))? {
            let entry = entry.map_err(|e| format!("Read staged face entry: {e}"))?;
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path).map_err(|e| format!("Inspect staged face entry {}: {e}", path.display()))?;
            if metadata.file_type().is_symlink() {
                return Err(format!("Symbolic links are not accepted in staged face data: {}", path.display()));
            }
            if metadata.is_dir() {
                walk(&path, changed_total)?;
                continue;
            }
            if !metadata.is_file() || !path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("fmdl")) {
                continue;
            }
            let bytes = fs::read(&path).map_err(|e| format!("Read FMDL {}: {e}", path.display()))?;
            let mut model = FmdlFile::read(&bytes).map_err(|e| format!("Parse FMDL {} before texture-path normalization: {e}", path.display()))?;
            let changed = rewrite_texture_paths(&mut model, |texture| {
                normalize_fox_texture_reference(&mut texture.directory, &mut texture.file_name);
            }).map_err(|e| format!("Normalize FMDL texture paths {}: {e}", path.display()))?;
            if changed == 0 { continue; }
            let encoded = model.write();
            let checked = FmdlFile::read(&encoded).map_err(|e| format!("Normalized FMDL failed read-back {}: {e}", path.display()))?;
            let original = FmdlFile::read(&bytes).map_err(|e| format!("Original FMDL failed read-back {}: {e}", path.display()))?;
            if checked.meshes.len() != original.meshes.len()
                || checked.bones.len() != original.bones.len()
                || checked.materials.len() != original.materials.len()
            {
                return Err(format!("Texture-path normalization unexpectedly changed model structure: {}", path.display()));
            }
            fs::write(&path, encoded).map_err(|e| format!("Write normalized FMDL {}: {e}", path.display()))?;
            *changed_total += changed;
        }
        Ok(())
    }
    let mut changed = 0;
    walk(root, &mut changed)?;
    Ok(changed)
}

/// Re-inject Fox-only sidecars after Team Compiler export. The upstream
/// Team Compiler filters .fclo files from its Pre-Fox output, so source inventory
/// alone is not evidence of preservation. Rebuild the nested player CPK and
/// outer team CPK with the original sidecar bytes, then verify them by read-back.
fn inject_preserved_sidecars(
    outer_path: &Path,
    player_root: &Path,
    player_id: &str,
    sidecars: &[String],
) -> Result<(), String> {
    if sidecars.is_empty() { return Ok(()); }
    let outer_bytes = fs::read(outer_path).map_err(|e| format!("Read Team Compiler CPK before sidecar preservation: {e}"))?;
    let mut outer = cpk::CpkArchive::open(Cursor::new(outer_bytes))
        .map_err(|e| format!("Open Team Compiler CPK for sidecar preservation: {e}"))?;
    let outer_entries = outer.entries().to_vec();
    let nested_index = outer_entries.iter().position(|entry| {
        entry.path.rsplit('/').next().is_some_and(|name| name.eq_ignore_ascii_case(&format!("{player_id}.cpk")))
    }).ok_or_else(|| format!("Team Compiler CPK has no nested face archive for player {player_id}."))?;
    let nested_entry = &outer_entries[nested_index];
    let nested_bytes = outer.read(nested_entry)
        .map_err(|e| format!("Read nested player CPK before sidecar preservation: {e}"))?;
    let mut nested = cpk::CpkArchive::open(Cursor::new(nested_bytes))
        .map_err(|e| format!("Open nested player CPK before sidecar preservation: {e}"))?;
    let nested_entries = nested.entries().to_vec();
    let mut nested_writer = cpk::CpkWriter::new(Cursor::new(Vec::new()), "FACE FORGE PLAYER FACE")
        .map_err(|e| format!("Create rebuilt nested face CPK: {e}"))?;
    let mut existing = std::collections::HashSet::new();
    for entry in &nested_entries {
        existing.insert(entry.path.trim_start_matches('/').to_ascii_lowercase());
        let bytes = nested.read(entry).map_err(|e| format!("Read nested CPK entry {}: {e}", entry.path))?;
        nested_writer.add(&entry.path, &bytes, None)
            .map_err(|e| format!("Copy nested CPK entry {}: {e}", entry.path))?;
    }
    for sidecar in sidecars {
        let relative = Path::new(sidecar);
        if relative.is_absolute() || relative.components().any(|part| !matches!(part, std::path::Component::Normal(_))) {
            return Err(format!("Unsafe preserved sidecar path: {sidecar}"));
        }
        let source = player_root.join(relative);
        let metadata = fs::symlink_metadata(&source).map_err(|e| format!("Inspect preserved sidecar {}: {e}", sidecar))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() > 256 * 1024 * 1024 {
            return Err(format!("Preserved sidecar is missing, unsafe or oversized: {sidecar}"));
        }
        let archive_name = relative.to_string_lossy().replace('\\', "/");
        if !existing.insert(archive_name.to_ascii_lowercase()) {
            return Err(format!("Sidecar collides with an existing nested CPK entry: {archive_name}"));
        }
        let bytes = fs::read(&source).map_err(|e| format!("Read preserved sidecar {}: {e}", sidecar))?;
        nested_writer.add(&archive_name, &bytes, None)
            .map_err(|e| format!("Add preserved sidecar {} to nested face CPK: {e}", sidecar))?;
    }
    let rebuilt_nested = nested_writer.finish().map_err(|e| format!("Finish rebuilt nested face CPK: {e}"))?.into_inner();
    let mut outer_writer = cpk::CpkWriter::new(Cursor::new(Vec::new()), "FACE FORGE TEAM")
        .map_err(|e| format!("Create rebuilt Team CPK: {e}"))?;
    for (index, entry) in outer_entries.iter().enumerate() {
        let bytes = if index == nested_index {
            rebuilt_nested.as_slice()
        } else {
            // The outer archive reader borrows its backing buffer; read all
            // original members before replacing the archive file.
            let data = outer.read(entry).map_err(|e| format!("Read outer CPK entry {}: {e}", entry.path))?;
            outer_writer.add(&entry.path, &data, None)
                .map_err(|e| format!("Copy outer CPK entry {}: {e}", entry.path))?;
            continue;
        };
        outer_writer.add(&entry.path, bytes, None)
            .map_err(|e| format!("Replace nested face CPK {}: {e}", entry.path))?;
    }
    let rebuilt_outer = outer_writer.finish().map_err(|e| format!("Finish rebuilt Team CPK: {e}"))?.into_inner();
    // Read-back both archive levels and require every sidecar to be present.
    let mut check_outer = cpk::CpkArchive::open(Cursor::new(&rebuilt_outer))
        .map_err(|e| format!("Read back rebuilt Team CPK: {e}"))?;
    let check_entry = check_outer.entries().iter().find(|entry| entry.path.rsplit('/').next().is_some_and(|name| name.eq_ignore_ascii_case(&format!("{player_id}.cpk"))))
        .ok_or_else(|| "Rebuilt Team CPK lost its nested player archive.".to_string())?.clone();
    let check_nested_bytes = check_outer.read(&check_entry).map_err(|e| format!("Read back rebuilt nested face CPK: {e}"))?;
    let mut check_nested = cpk::CpkArchive::open(Cursor::new(check_nested_bytes))
        .map_err(|e| format!("Validate rebuilt nested face CPK: {e}"))?;
    for sidecar in sidecars {
        let basename = Path::new(sidecar).file_name().and_then(|v| v.to_str()).unwrap_or(sidecar);
        if !check_nested.entries().iter().any(|entry| entry.path.rsplit('/').next().is_some_and(|name| name.eq_ignore_ascii_case(basename))) {
            return Err(format!("Sidecar preservation read-back failed for {sidecar}."));
        }
    }
    fs::write(outer_path, rebuilt_outer).map_err(|e| format!("Write rebuilt Team CPK: {e}"))?;
    Ok(())
}

fn companion_fmdl_for_skeleton(skeleton: &Path) -> PathBuf {
    if skeleton.file_stem().and_then(|value| value.to_str()).is_some_and(|stem| stem.eq_ignore_ascii_case("fcl_hair_sim")) {
        skeleton.with_file_name("fcl_hair.fmdl")
    } else {
        skeleton.with_extension("fmdl")
    }
}

fn copy_face_source_tree(
    source: &Path,
    destination: &Path,
    archive_paths: &mut Vec<PathBuf>,
    seen: &mut std::collections::HashSet<String>,
    file_count: &mut usize,
    total_bytes: &mut u64,
) -> Result<(), String> {
    for entry in fs::read_dir(source).map_err(|e| format!("Read face source folder {}: {e}", source.display()))? {
        let entry = entry.map_err(|e| format!("Read face source entry: {e}"))?;
        let from = entry.path();
        let metadata = fs::symlink_metadata(&from).map_err(|e| format!("Inspect face source entry {}: {e}", from.display()))?;
        if metadata.file_type().is_symlink() {
            return Err(format!("Symbolic links are not accepted in face conversion input: {}", from.display()));
        }
        if metadata.is_dir() {
            let relative = from.strip_prefix(source).map_err(|_| "Face source path escaped its root.")?;
            let to = destination.join(relative);
            fs::create_dir_all(&to).map_err(|e| format!("Create face staging folder {}: {e}", to.display()))?;
            copy_face_source_tree(&from, &to, archive_paths, seen, file_count, total_bytes)?;
            continue;
        }
        if !metadata.is_file() {
            return Err(format!("Unsupported filesystem entry in face source: {}", from.display()));
        }
        let extension = from.extension().and_then(|x| x.to_str()).unwrap_or("").to_ascii_lowercase();
        if is_face_archive_extension(&extension) {
            archive_paths.push(from);
            continue;
        }
        *file_count += 1;
        *total_bytes = total_bytes.saturating_add(metadata.len());
        if *file_count > 10_000 || *total_bytes > 2 * 1024 * 1024 * 1024 {
            return Err("Face source exceeds the safety limit of 10,000 files or 2 GiB.".into());
        }
        let relative = from.strip_prefix(source).map_err(|_| "Face source path escaped its root.")?;
        let relative_text = relative.to_string_lossy().replace('\\', "/");
        let normalized = normalize_fox_virtual_path(&relative_text)?;
        if !seen.insert(normalized.to_ascii_lowercase()) {
            return Err(format!("Duplicate case-insensitive face source path: {normalized}"));
        }
        let to = destination.join(PathBuf::from(normalized));
        if let Some(parent) = to.parent() {            fs::create_dir_all(parent).map_err(|e| format!("Create face asset folder {}: {e}", parent.display()))?;
        }
        fs::copy(&from, &to).map_err(|e| format!("Stage face asset {}: {e}", from.display()))?;
    }
    Ok(())
}

#[derive(Default)]
struct Pes2021FaceInventory {
    models: Vec<String>,
    texture_count: usize,
    face_diff: Option<String>,
    preserved_sidecars: Vec<String>,
}

fn inspect_pes2021_face_source(root: &Path) -> Result<Pes2021FaceInventory, String> {
    fn walk(root: &Path, current: &Path, inventory: &mut Pes2021FaceInventory, model_paths: &mut std::collections::HashSet<String>, skeleton_paths: &mut Vec<PathBuf>) -> Result<(), String> {
        for entry in fs::read_dir(current).map_err(|e| format!("Inspect PES 2021 face source {}: {e}", current.display()))? {
            let entry = entry.map_err(|e| format!("Read PES 2021 face source entry: {e}"))?;
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path).map_err(|e| format!("Inspect PES 2021 face source entry {}: {e}", path.display()))?;
            if metadata.file_type().is_symlink() {
                return Err(format!("Symbolic links are not accepted in a PES 2021 face source: {}", path.display()));
            }
            if metadata.is_dir() {
                walk(root, &path, inventory, model_paths, skeleton_paths)?;
                continue;
            }
            if !metadata.is_file() { return Err(format!("Unsupported filesystem entry: {}", path.display())); }
            let relative = path.strip_prefix(root).map_err(|_| "PES 2021 source path escaped its root.")?;
            let relative_text = relative.to_string_lossy().replace('\\', "/");
            let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("");
            let lower = name.to_ascii_lowercase();
            let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
            match extension.as_str() {
                "fmdl" => {
                    let bytes = fs::read(&path).map_err(|e| format!("Read source FMDL {}: {e}", relative_text))?;
                    let file = FmdlFile::read(&bytes).map_err(|e| format!("Invalid PES 2021 FMDL {relative_text}: {e}"))?;
                    FoxModel::from_file(&file).map_err(|e| format!("Unresolved PES 2021 FMDL references in {relative_text}: {e}"))?;
                    model_paths.insert(relative_text.to_ascii_lowercase());
                    inventory.models.push(relative_text);
                }
                "model" | "mtl" => return Err(format!("This first-release route accepts PES 2021 Fox assets only; legacy .{extension} source detected at {relative_text}.")),
                "skl" => {
                    let bytes = fs::read(&path).map_err(|e| format!("Read source SKL {}: {e}", relative_text))?;
                    SklFile::read(&bytes).map_err(|e| format!("Invalid PES 2021 SKL {relative_text}: {e}"))?;
                    skeleton_paths.push(path);
                }
                "ftex" => {
                    let bytes = fs::read(&path).map_err(|e| format!("Read source FTEX {}: {e}", relative_text))?;
                    ftex_info(&bytes).map_err(|e| format!("Invalid PES 2021 FTEX {relative_text}: {e}"))?;
                    inventory.texture_count += 1;
                }
                "dds" => inventory.texture_count += 1,
                "fclo" => inventory.preserved_sidecars.push(relative_text),
                _ => {
                    if lower == "face_diff.bin" {
                        if inventory.face_diff.is_some() { return Err("The source face contains multiple face_diff.bin files.".into()); }
                        let bytes = fs::read(&path).map_err(|e| format!("Read FACE diff {}: {e}", relative_text))?;
                        validate_face_diff_payload(&bytes).map_err(|e| format!("Invalid PES 2021 FACE diff {relative_text}: {e}"))?;
                        inventory.face_diff = Some(relative_text);
                    }
                }
            }
        }
        Ok(())
    }
    let mut inventory = Pes2021FaceInventory::default();
    let mut model_paths = std::collections::HashSet::new();
    let mut skeleton_paths = Vec::new();
    walk(root, root, &mut inventory, &mut model_paths, &mut skeleton_paths)?;
    if !inventory.models.iter().any(|value| value.rsplit('/').next().is_some_and(|name| name.eq_ignore_ascii_case("face_high.fmdl"))) {
        return Err("A PES 2021 face source must contain face_high.fmdl; no head model was found.".into());
    }
    for skeleton in skeleton_paths {
        let model = companion_fmdl_for_skeleton(&skeleton);
        let relative = model.strip_prefix(root).map_err(|_| "PES 2021 SKL path escaped its source root.")?.to_string_lossy().replace('\\', "/").to_ascii_lowercase();
        if !model_paths.contains(&relative) {
            return Err(format!("Orphan PES 2021 skeleton {} has no matching FMDL (expected {}).", skeleton.display(), model.display()));
        }
    }
    inventory.models.sort();
    inventory.preserved_sidecars.sort();
    Ok(inventory)
}

fn extract_face_archives(
    archive_paths: &[PathBuf],
    destination: &Path,
    seen: &mut std::collections::HashSet<String>,
    file_count: &mut usize,
    total_bytes: &mut u64,
) -> Result<(), String> {
    let fpk: Vec<_> = archive_paths.iter().filter(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("fpk"))).collect();
    let fpkd: Vec<_> = archive_paths.iter().filter(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("fpkd") || x.eq_ignore_ascii_case("kpfd"))).collect();
    if fpk.len() > 1 || fpkd.len() > 1 {
        return Err("A face folder must contain at most one face.fpk and one paired face.fpkd/.kpfd archive.".into());
    }
    if fpk.is_empty() && !fpkd.is_empty() {
        return Err("A face.fpkd/.kpfd archive was found without its face.fpk companion.".into());    }
    for path in fpk.iter().chain(fpkd.iter()) {
        let metadata = fs::symlink_metadata(path).map_err(|e| format!("Inspect Fox archive {}: {e}", path.display()))?;
        if !metadata.is_file() || metadata.len() > 1024 * 1024 * 1024 {
            return Err(format!("Fox archive is not a regular file or exceeds 1 GiB: {}", path.display()));
        }
        let bytes = fs::read(path).map_err(|e| format!("Read Fox archive {}: {e}", path.display()))?;
        let archive = FpkFile::read(&bytes).map_err(|e| format!("Decode Fox archive {}: {e}", path.display()))?;
        for (name, data) in archive.entries() {
            let normalized = normalize_fox_virtual_path(name)?;
            if !seen.insert(normalized.to_ascii_lowercase()) {
                return Err(format!("Duplicate case-insensitive path across loose files and Fox archives: {normalized}"));
            }
            *file_count += 1;
            *total_bytes = total_bytes.saturating_add(data.len() as u64);
            if *file_count > 10_000 || *total_bytes > 2 * 1024 * 1024 * 1024 {
                return Err("Expanded face source exceeds the safety limit of 10,000 files or 2 GiB.".into());
            }
            let target = destination.join(PathBuf::from(normalized));
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("Create extracted asset folder {}: {e}", parent.display()))?;
            }
            fs::write(&target, data).map_err(|e| format!("Extract Fox package member {}: {e}", target.display()))?;
        }
    }
    Ok(())
}

fn split_pes2017_target_player_id(target_player_id: &str) -> Result<(&str, &str), String> {
    if target_player_id.len() != 5 || !target_player_id.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("Target PES 2017 player ID must contain exactly five digits.".into());
    }
    let team_id = &target_player_id[..3];
    let team_number = team_id.parse::<u16>().map_err(|_| "Target PES 2017 team ID is invalid.")?;
    if !(701..=920).contains(&team_number) {
        return Err(format!("Target PES 2017 ID {target_player_id} is invalid: its first three digits must be a PES 2017 team ID from 701 through 920. The source PES 2021 face ID is not a PES 2017 target ID."));
    }
    let player_slot = &target_player_id[3..5];
    let slot_number = player_slot.parse::<u8>().map_err(|_| "Target PES 2017 roster slot is invalid.")?;
    if !(1..=23).contains(&slot_number) {
        return Err(format!("Target PES 2017 ID {target_player_id} is invalid: its roster slot must be from 01 through 23."));
    }
    Ok((team_id, player_slot))
}

fn convert_complete_face_folder(input: &Path, target: u16, output: &Path, target_player_id: &str) -> Result<serde_json::Value, String> {
    if target != 2017 {
        return Err("The first FACE FORGE release supports PES 2021 → PES 2017 only. PES 2017 → PES 2021 is deferred.".into());
    }
    let (team_id, player_slot) = split_pes2017_target_player_id(target_player_id)?;
    let input_metadata = fs::symlink_metadata(input).map_err(|e| format!("Inspect face input: {e}"))?;
    if input_metadata.file_type().is_symlink() || !input_metadata.is_dir() {
        return Err("Complete face conversion requires a real source folder.".into());
    }
    let input = fs::canonicalize(input).map_err(|e| format!("Resolve face input folder: {e}"))?;
    let output_metadata = fs::symlink_metadata(output).map_err(|e| format!("Inspect output staging folder: {e}"))?;
    if output_metadata.file_type().is_symlink() || !output_metadata.is_dir() {
        return Err("The conversion output must be a real staging directory.".into());
    }
    if fs::read_dir(output).map_err(|e| format!("Read output staging folder: {e}"))?.next().is_some() {
        return Err("The conversion output staging folder must be empty.".into());
    }

    let workspace = create_temp_workspace()?;
    // Team Compiler requires the coverage tag as the second word in team export names.
    let export = workspace.0.join("exports").join("ff Full FACE FORGE");
    let player = export.join("Players").join(format!("{player_slot} - FACE FORGE"));
    let data = workspace.0.join("data");
    let pes = workspace.0.join("PES");
    fs::create_dir_all(&player).map_err(|e| format!("Create staged player folder: {e}"))?;
    fs::create_dir_all(&data).map_err(|e| format!("Create Team compiler data folder: {e}"))?;
    fs::create_dir_all(&pes).map_err(|e| format!("Create isolated PES settings folder: {e}"))?;

    let mut archive_paths = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut file_count = 0usize;
    let mut total_bytes = 0u64;
    copy_face_source_tree(&input, &player, &mut archive_paths, &mut seen, &mut file_count, &mut total_bytes)?;
    extract_face_archives(&archive_paths, &player, &mut seen, &mut file_count, &mut total_bytes)?;
    let normalized_texture_references = normalize_fox_face_model_paths(&player)?;
    let source_inventory = inspect_pes2021_face_source(&player)?;
    let has_model = {
        fn any_model(root: &Path) -> Result<bool, String> {
            for entry in fs::read_dir(root).map_err(|e| format!("Inspect staged face assets: {e}"))? {
                let entry = entry.map_err(|e| format!("Read staged face asset: {e}"))?;
                let path = entry.path();
                if path.is_dir() { if any_model(&path)? { return Ok(true); } }
                else if path.extension().is_some_and(|x| x.eq_ignore_ascii_case("fmdl") || x.eq_ignore_ascii_case("model")) { return Ok(true); }
            }
            Ok(false)
        }
        any_model(&player)?
    };
    if !has_model {
        return Err("The selected face folder contains no .fmdl or .model assets, including its FPK/FPKD archives.".into());
    }

    fs::write(data.join("teams_list.txt"), format!("ID\tName\n{team_id}\t/ff/\n"))
        .map_err(|e| format!("Write isolated Team compiler team list: {e}"))?;
    let pes_version = if target == 2017 { 17 } else { 21 };
    let settings_text = format!(
        "[common]\npes_version = {pes_version}\npes_folder_path = {:?}\n\n[team-compiler]\ncpk_name = \"face-forge-{target_player_id}\"\noutput_folder_path = {:?}\nteams_list_path = \"teams_list.txt\"\nstrict_file_type_check = true\npass_through = false\n",
        pes.to_string_lossy().to_string(),
        output.to_string_lossy().to_string()
    );
    let mut settings = Settings::parse(&settings_text).map_err(|e| format!("Build isolated Team compiler settings: {e}"))?;
    let tool = TeamCompilerTool::with_running_probe(|| Vec::new());
    settings.merge_defaults(tool.id(), &tool.default_settings());
    let (events_tx, events_rx) = unbounded();
    let (requests_tx, _requests_rx) = unbounded::<ShellRequest>();
    let context = ToolContext::new(
        Arc::new(Mutex::new(settings)),
        AppPaths { exe_dir: workspace.0.clone(), data_dir: Some(data) },
        events_tx,        requests_tx
    );
    let export_arg = export.to_string_lossy().to_string();
    let matches = tool.cli_command().try_get_matches_from([
        "team-compiler", "compile", "--no-deploy", "--export", export_arg.as_str()
    ]).map_err(|e| format!("Build upstream Team compiler command: {e}"))?;
    let exit_code = tool.cli_run(&matches, &context).map_err(|e| format!("Upstream Team compiler refused the conversion: {e}"))?;
    drop(context);

    let mut complete: Option<(bool, usize)> = None;
    let mut event_summaries = Vec::new();
    for envelope in events_rx.try_iter() {
        match envelope.event {
            PipelineEvent::Complete { success, files_written, .. } => complete = Some((success, files_written)),
            PipelineEvent::Message(message) => event_summaries.push(format!("{:?}", message)),
            other => event_summaries.push(format!("{other:?}")),
        }
    }
    if exit_code != 0 || !complete.is_some_and(|(success, _)| success) {
        let details = event_summaries.iter().take(24).cloned().collect::<Vec<_>>().join(" | ");
        return Err(format!("Upstream Team compiler did not complete cleanly (exit {exit_code}). {details}"));
    }
    let mut output_files = Vec::new();
    for entry in fs::read_dir(output).map_err(|e| format!("Read converted output: {e}"))? {
        let entry = entry.map_err(|e| format!("Read converted output entry: {e}"))?;
        if entry.file_type().map_err(|e| format!("Inspect converted output: {e}"))?.is_file() {
            output_files.push(entry.file_name().to_string_lossy().to_string());
        }
    }
    let cpk_files: Vec<_> = output_files.iter().filter(|name| name.to_ascii_lowercase().ends_with(".cpk")).cloned().collect();
    if cpk_files.is_empty() {
        return Err("Upstream Team compiler reported success but produced no CPK archive.".into());
    }
    for archive_name in &cpk_files {
        inject_preserved_sidecars(&output.join(archive_name), &player, target_player_id, &source_inventory.preserved_sidecars)?;
    }
    let report = serde_json::json!({
        "ok": true,
        "engine": "Unlimited Tool Works Team Compiler",
        "target": target,
        "targetPlayerId": target_player_id,
        "sourceFolder": input.file_name().and_then(|x| x.to_str()).unwrap_or("face-folder"),
        "sourceFiles": file_count,
        "sourceBytes": total_bytes,
        "sourceModels": source_inventory.models,
        "sourceTextureCount": source_inventory.texture_count,
        "normalizedTextureReferences": normalized_texture_references,
        "sourceFaceDiff": source_inventory.face_diff,
        "preservedSidecars": source_inventory.preserved_sidecars,
        "outputFiles": output_files,
        "cpkFiles": cpk_files,
        "events": event_summaries.iter().take(500).collect::<Vec<_>>(),
        "eventCount": event_summaries.len(),
        "complete": complete.map(|(success, files_written)| serde_json::json!({"success":success,"filesWritten":files_written}))
    });
    let report_path = output.join("face-forge-report.json");
    fs::write(&report_path, serde_json::to_vec_pretty(&report).map_err(|e| format!("Serialize conversion report: {e}"))?)
        .map_err(|e| format!("Write conversion report: {e}"))?;
    Ok(report)
}

fn run()->Result<(),String>{
 let args:Vec<String>=env::args().collect();
 if args.get(1).map(String::as_str)==Some("extract-cpk"){
  let input=PathBuf::from(required(&args,"--input")?);
  let output=PathBuf::from(required(&args,"--out")?);
  let mut prefixes=Vec::new();let mut index=2;
  while index<args.len(){if args[index]=="--prefix"{let value=args.get(index+1).ok_or_else(||"--prefix requires a path".to_string())?;prefixes.push(value.clone());index+=2;}else{index+=1;}}
  let report=cpk_extract::extract_cpk_archive(&input,&output,&prefixes)?;
  println!("{}",report);return Ok(());
 }
 if args.get(1).map(String::as_str)==Some("convert-face-folder"){
  let input=PathBuf::from(required(&args,"--input")?);
  let target:u16=required(&args,"--target")?.parse().map_err(|_|"Target must be 2017 or 2021".to_string())?;
  let output=PathBuf::from(required(&args,"--out")?);
  let player_id=required(&args,"--player-id")?;
  let report=convert_complete_face_folder(&input,target,&output,&player_id)?;
  println!("{}",report);
  return Ok(());
 }
 if args.get(1).map(String::as_str)==Some("convert-texture"){
  let input=PathBuf::from(required(&args,"--input")?);let output=PathBuf::from(required(&args,"--out")?);let direction=required(&args,"--direction")?;let color=match optional(&args,"--color-space").as_deref().unwrap_or("srgb"){"srgb"=>ColorSpace::Srgb,"linear"=>ColorSpace::Linear,"normal"=>ColorSpace::Normal,_=>return Err("Color space must be srgb, linear or normal".into())};let bytes=fs::read(&input).map_err(|e|format!("Read texture: {e}"))?;
  let result=match direction.as_str(){"ftex-to-dds"=>ftex_to_dds(&bytes).map_err(|e|format!("FTEX decode: {e}"))?,"dds-to-ftex"=>dds_to_ftex(&bytes,color).map_err(|e|format!("DDS encode: {e}"))?,_=>return Err("Texture direction must be ftex-to-dds or dds-to-ftex".into())};
  if direction=="ftex-to-dds"{let _=ftex_info(&bytes).map_err(|e|format!("FTEX validation: {e}"))?;}else{let _=ftex_info(&result).map_err(|e|format!("Generated FTEX validation: {e}"))?;}
  write(&output,&result)?;println!("{}",serde_json::json!({"ok":true,"bytes":result.len()}));return Ok(());
 }
 if args.get(1).map(String::as_str)!=Some("convert-model"){return Err("Usage: face-forge-native extract-cpk --input ARCHIVE.cpk --out EMPTY_DIR [--prefix PATH]... | convert-face-folder --input FOLDER --target 2017|2021 --out EMPTY_DIR | convert-model ... | convert-texture --input FILE --direction ftex-to-dds|dds-to-ftex --color-space srgb|linear|normal --out FILE".into());}
 let source_format=required(&args,"--source-format")?;let target_text=required(&args,"--target")?;let out=PathBuf::from(required(&args,"--out")?);
 let model_paths:Vec<PathBuf>=args.iter().enumerate().filter(|(_,arg)|arg.as_str()=="--model").filter_map(|(i,_)|args.get(i+1)).map(PathBuf::from).collect();
 if model_paths.is_empty(){return Err("At least one --model input is required.".into());}
 let target:u16=target_text.parse().map_err(|_|"Target must be 2017 or 2021".to_string())?;if target!=2017&&target!=2021{return Err("Target must be 2017 or 2021".into());}
 for path in &model_paths{if !path.is_file(){return Err(format!("Source model does not exist: {}",path.display()));}}
 if source_format=="fpk"&&(model_paths.is_empty()||model_paths.len()>2){return Err("Supply one face FPK and optionally its paired FPKD archive.".into());}
 let textures_managed_externally=args.iter().any(|arg|arg=="--textures-managed-externally");
 let mut package_textures:Vec<(String,Vec<u8>)>=Vec::new();
 let mut package_face_diff:Option<Vec<u8>>=None;
 let mut source_face_diff:Option<Vec<u8>>=None;
 let bundles:Vec<(String,NativeModelBundle)>=match source_format.as_str(){
  "fpk"=>{
   if target!=2017{return Err("A PES 2021 Fox package source must target PES 2017.".into());}
   let mut archive_entries:Vec<(String,Vec<u8>)>=Vec::new();let mut seen=std::collections::HashSet::new();
   for archive_path in &model_paths{
    let bytes=fs::read(archive_path).map_err(|e|format!("Read source Fox archive {}: {e}",archive_path.display()))?;
    let archive=FpkFile::read(&bytes).map_err(|e|format!("Decode source FPK/FPKD {}: {e}",archive_path.display()))?;    for (name,data) in archive.entries(){
     let normalized=normalize_fox_virtual_path(name)?;
     if !seen.insert(normalized.to_ascii_lowercase()){return Err(format!("The paired FPK/FPKD archives contain a duplicate virtual path: {normalized}"));}
     archive_entries.push((normalized,data.to_vec()));
    }
   }
   // Validate every member before conversion. In particular, do not accept
   // FTEX merely because a standalone texture command exists: this package
   // path must emit/relink every accepted member or reject the whole package.
   let member_names:Vec<String>=archive_entries.iter().map(|(name,_)|name.clone()).collect();
   validate_face_package_members(&member_names)?;
   package_textures=archive_entries.iter().filter(|(name,_)|name.to_ascii_lowercase().ends_with(".ftex")).map(|(name,data)|(name.clone(),data.clone())).collect();
   let face_diff_entries:Vec<_>=archive_entries.iter().filter(|(name,_)|name.eq_ignore_ascii_case("face_diff.bin")).collect();
   if face_diff_entries.len()>1{return Err("The Fox package contains multiple face_diff.bin sidecars.".into());}
   package_face_diff=face_diff_entries.first().map(|(_,data)|data.clone());
   let candidates:Vec<_>=archive_entries.iter().filter(|(name,_)|name.to_ascii_lowercase().ends_with(".fmdl")).collect();
   if candidates.is_empty(){return Err("Neither the FPK nor its paired FPKD contains an FMDL model.".into());}
   let mut names=std::collections::HashSet::new();let mut converted=Vec::new();
   for (name,data) in candidates{
    let file_name=name.rsplit('/').next().unwrap_or(name);let stem=file_name.rsplit_once('.').map(|x|x.0).unwrap_or(file_name);
    if stem.is_empty()||!stem.chars().all(|c|c.is_ascii_alphanumeric()||c=='_'||c=='-'){return Err(format!("Unsafe or unsupported model name in Fox archive: {name}"));}
    if !names.insert(stem.to_ascii_lowercase()){return Err(format!("Multiple archive models collapse to the same output name: {stem}"));}
    let skl_name=format!("{}.skl",&name[..name.len()-5]);
    let file=FmdlFile::read(data).map_err(|e|format!("Decode packaged FMDL {name}: {e}"))?;
    let model=FoxModel::from_file(&file).map_err(|e|format!("Resolve packaged FMDL references {name}: {e}"))?;
    let skl_bytes=archive_entries.iter().find(|(candidate,_)|candidate.eq_ignore_ascii_case(&skl_name)).map(|(_,bytes)|bytes);
    let skl=skl_bytes.map(|bytes|SklFile::read(bytes).map_err(|e|format!("Decode companion SKL {skl_name}: {e}"))).transpose()?;
    converted.push((stem.to_owned(),NativeModelBundle::Fox{model,skl}));
   }converted
  },
  "fmdl"=>{
   if target==2021{return Err("Source and target are both PES 2021; select PES 2017 as target.".into());}
   let mut converted=Vec::new();
   for model_path in &model_paths{
    let bytes=fs::read(model_path).map_err(|e|format!("Read FMDL {}: {e}",model_path.display()))?;
    let file=FmdlFile::read(&bytes).map_err(|e|format!("Decode FMDL {}: {e}",model_path.display()))?;
    let model=FoxModel::from_file(&file).map_err(|e|format!("Resolve FMDL references {}: {e}",model_path.display()))?;
    let skl_path=model_path.with_extension("skl");
    let skl=if skl_path.exists(){let data=fs::read(&skl_path).map_err(|e|format!("Read SKL: {e}"))?;Some(SklFile::read(&data).map_err(|e|format!("Decode SKL: {e}"))?)}else{None};
    let stem=model_path.file_stem().and_then(|x|x.to_str()).ok_or("Invalid FMDL file name")?.to_owned();
    converted.push((stem,NativeModelBundle::Fox{model,skl}));
   }converted
  },
  "model"=>{
   if target==2017{return Err("Source and target are both PES 2017; select PES 2021 as target.".into());}
   let mut converted=Vec::new();
   for model_path in &model_paths{
    let bytes=fs::read(model_path).map_err(|e|format!("Read MODEL {}: {e}",model_path.display()))?;
    let model_payload=decompress_if_wrapped(&bytes).map_err(|e|format!("Decode WESYS wrapper {}: {e}",model_path.display()))?;
    let file=PreFoxModel::read(&model_payload).map_err(|e|format!("Decode MODEL {}: {e}",model_path.display()))?;
    let model=PreFoxSemanticModel::from_file(&file).map_err(|e|format!("Resolve MODEL geometry {}: {e}",model_path.display()))?;
    let mtl_path=model_path.with_extension("mtl");
    if !mtl_path.is_file(){return Err(format!("PES 2017 MODEL {} requires its companion .mtl file",model_path.display()));}
    let mtl_bytes=fs::read(&mtl_path).map_err(|e|format!("Read MTL: {e}"))?;
    let mtl=MaterialSet::read(&mtl_bytes).map_err(|e|format!("Decode MTL: {e}"))?;
    let stem=model_path.file_stem().and_then(|x|x.to_str()).ok_or("Invalid MODEL file name")?.to_owned();
    converted.push((stem,NativeModelBundle::PreFox{model,mtl}));
   }converted
  },
  _=>return Err("--source-format must be fmdl, fpk or model".into())
 };
 if bundles.is_empty(){return Err("No convertible models were discovered.".into());}
 let mut output_names=std::collections::HashSet::new();
 for (stem,_) in &bundles{if stem.is_empty()||!stem.chars().all(|c|c.is_ascii_alphanumeric()||c=='_'||c=='-'){return Err(format!("Unsafe output model stem: {stem}"));}if !output_names.insert(stem.to_ascii_lowercase()){return Err(format!("Duplicate output model stem: {stem}"));}}
 if source_format=="model" {
  if let Some(diff_path)=optional(&args,"--face-diff") {
   source_face_diff=Some(fs::read(&diff_path).map_err(|e|format!("Read source FACE diff {diff_path}: {e}"))?);
  } else if let Some(xml_path)=optional(&args,"--face-xml") {
   let bytes=fs::read(&xml_path).map_err(|e|format!("Read source legacy face XML {xml_path}: {e}"))?;
   source_face_diff=legacy_face_diff_from_xml(&bytes)?;
  }
 }
 let target_version=if target==2017{pes_version::PesVersion::Pes17}else{pes_version::PesVersion::Pes21};
 fs::create_dir_all(&out).map_err(|e|format!("Create output folder: {e}"))?;
 if fs::read_dir(&out).map_err(|e|format!("Read output folder: {e}"))?.next().is_some(){return Err("Output directory must be empty; no files were written.".into());}
 let model_count=bundles.len();let model_stems:Vec<String>=bundles.iter().map(|(stem,_)|stem.clone()).collect();let mut outputs=Vec::new();let mut pending_outputs:Vec<(String,Vec<u8>)>=Vec::new();let mut findings:Vec<serde_json::Value>=Vec::new();
 for (stem,bundle) in bundles{
  let mut converted=convert(bundle,target_version).map_err(|e|format!("Cross-generation conversion rejected for {stem}: {e}"))?;
  match &mut converted.bundle {
   NativeModelBundle::PreFox{mtl,..}=>{for material in &mut mtl.materials{for entry in &mut material.entries{if let pes_model::format::mtl::MaterialEntry::Sampler(sampler)=entry{replace_texture_extension(&mut sampler.path,"ftex","dds")?;}}}},
   NativeModelBundle::Fox{model,..}=>{for material in &mut model.materials{for (_,texture) in &mut material.textures{replace_texture_extension(&mut texture.file_name,"dds","ftex")?;}}}
  }
  for finding in &converted.findings{
   let subject=match &finding.subject {Subject::Model=>serde_json::json!({"type":"model"}),Subject::Mesh(index)=>serde_json::json!({"type":"mesh","index":index}),Subject::Material(index)=>serde_json::json!({"type":"material","index":index}),Subject::Bone(index)=>serde_json::json!({"type":"bone","index":index})};
   findings.push(serde_json::json!({"model":stem,"code":finding.code,"subject":subject,"detail":&finding.detail}));
  }
  match converted.bundle{
   NativeModelBundle::PreFox{model,mtl}=>{
    let file=model.to_file().map_err(|e|format!("Encode PES 2017 MODEL {stem}: {e}"))?;
    let model_bytes=file.write().map_err(|e|format!("Serialize PES 2017 MODEL {stem}: {e}"))?;
    let mtl_bytes=mtl.write();
    let checked_model=PreFoxModel::read(&model_bytes).map_err(|e|format!("PES 2017 MODEL read-back failed for {stem}: {e}"))?;
    PreFoxSemanticModel::from_file(&checked_model).map_err(|e|format!("PES 2017 MODEL semantic read-back failed for {stem}: {e}"))?;
    MaterialSet::read(&mtl_bytes).map_err(|e|format!("PES 2017 MTL read-back failed for {stem}: {e}"))?;
    let model_name=if source_format=="fpk"{format!("oral_{stem}_win32.model")}else{format!("{stem}.model")};
    pending_outputs.push((model_name.clone(),model_bytes));pending_outputs.push((format!("{stem}.mtl"),mtl_bytes));
    outputs.push(model_name);outputs.push(format!("{stem}.mtl"));
   },
   NativeModelBundle::Fox{model,skl}=>{
    let file=model.to_file().map_err(|e|format!("Encode PES 2021 FMDL {stem}: {e}"))?;let model_bytes=file.write();    let checked_file=FmdlFile::read(&model_bytes).map_err(|e|format!("PES 2021 FMDL read-back failed for {stem}: {e}"))?;
    FoxModel::from_file(&checked_file).map_err(|e|format!("PES 2021 FMDL semantic read-back failed for {stem}: {e}"))?;
    let skl_bytes=skl.as_ref().map(SklFile::write);
    if let Some(bytes)=&skl_bytes{SklFile::read(bytes).map_err(|e|format!("PES 2021 SKL read-back failed for {stem}: {e}"))?;}
    pending_outputs.push((format!("{stem}.fmdl"),model_bytes));outputs.push(format!("{stem}.fmdl"));
    if let Some(bytes)=skl_bytes{pending_outputs.push((format!("{stem}.skl"),bytes));outputs.push(format!("{stem}.skl"));}
   }
  }
 }

 if !textures_managed_externally {
  // Convert every FTEX package member and preserve its virtual directory so
  // the already-rewritten material sampler path resolves in the target output.
  let mut output_paths:std::collections::HashSet<String>=outputs.iter().map(|p|p.to_ascii_lowercase()).collect();
  for (source_path,source_bytes) in &package_textures {
   let _=ftex_info(source_bytes).map_err(|e|format!("Validate packaged FTEX {source_path}: {e}"))?;
   let target_path=ftex_target_path(source_path)?;
   if !output_paths.insert(target_path.to_ascii_lowercase()) {
    return Err(format!("Package conversion produces a duplicate target path: {target_path}"));
   }
   let dds=ftex_to_dds(source_bytes).map_err(|e|format!("Convert packaged FTEX {source_path}: {e}"))?;
   if dds.len()<128 || &dds[..4]!=b"DDS " {
    return Err(format!("FTEX decoder produced an invalid DDS header for {source_path}"));
   }
   pending_outputs.push((target_path.clone(),dds));
   outputs.push(target_path);
  }
 
 }
 if source_format=="fpk" {
  if let Some(face_diff)=package_face_diff.as_deref() {
   // PES 2017's face.xml stores the face diff as a <dif> payload. The pinned
   // upstream Team Compiler validates the FACE header/count-derived length and
   // preserves the payload byte-for-byte when compiling Fox FMDL faces to
   // pre-Fox packages; it does not reject the payload by the FACE version word.
   // Keep the same lossless rule here: validate structure, never invent a
   // guessed 33-to-32 facial-bone remap.
   validate_face_diff_payload(face_diff)?;
  }
  let xml=legacy_face_xml(package_face_diff.as_deref(),&model_stems)?;
  outputs.push("face.xml".into());
  pending_outputs.push(("face.xml".into(),xml));
 }
 if let Some(face_diff)=source_face_diff.as_deref() {
  validate_face_diff_generation(face_diff, target)?;
  let _validated=legacy_face_xml(Some(face_diff),&model_stems)?;
  outputs.push("face_diff.bin".into());
  pending_outputs.push(("face_diff.bin".into(),face_diff.to_vec()));
 }
 let stage=out.join(".faceforge-staging");fs::create_dir(&stage).map_err(|e|format!("Create staging directory: {e}"))?;
 for (name,data) in pending_outputs{if let Err(error)=write(&stage.join(&name),&data){let _=fs::remove_dir_all(&stage);return Err(error);}}
 let mut committed:Vec<PathBuf>=Vec::new();
 for name in &outputs{
  let from=stage.join(name);let to=out.join(name);
  if let Some(parent)=to.parent(){if let Err(error)=fs::create_dir_all(parent){for path in committed{let _=fs::remove_file(path);}let _=fs::remove_dir_all(&stage);return Err(format!("Create target output directory for {}: {error}",name));}}
  if let Err(error)=fs::rename(&from,&to){for path in committed{let _=fs::remove_file(path);}let _=fs::remove_dir_all(&stage);return Err(format!("Commit converted output {}: {error}",name));}
  committed.push(to);
 }
 let _=fs::remove_dir_all(&stage);
 let report=serde_json::json!({"ok":true,"target":target,"model_count":model_count,"outputs":outputs,"findings":findings});println!("{}",report);Ok(())
}
fn main(){if let Err(error)=run(){eprintln!("FACE_FORGE_CONVERSION_ERROR: {error}");process::exit(2);}}

#[cfg(test)]
mod face_diff_xml_tests {
    use super::{base64_encode, decode_base64, legacy_face_diff_from_xml, legacy_face_xml, validate_face_diff_generation, validate_face_diff_payload};

    fn v4_fixture() -> Vec<u8> {
        decode_base64(include_str!("../../tests/fixtures/face-diff-real-v4.b64")).unwrap()
    }

    fn v5_fixture() -> Vec<u8> {
        decode_base64(include_str!("../../tests/fixtures/face-diff-real-v5.b64")).unwrap()
    }

    #[test]
    fn validates_and_roundtrips_real_v4_and_v5_payloads_without_mutating_bytes() {
        let v4 = v4_fixture();
        let v5 = v5_fixture();
        assert_eq!(v4.len(), 944);
        assert_eq!(v5.len(), 960);
        validate_face_diff_payload(&v4).unwrap();
        validate_face_diff_payload(&v5).unwrap();

        // The same source payload survives either package representation byte-for-byte:
        // pre-Fox face.xml <dif>, or a Fox face_diff.bin sidecar.
        for payload in [&v4, &v5] {
            let xml = legacy_face_xml(Some(payload), &["face_high".into()]).unwrap();
            assert_eq!(legacy_face_diff_from_xml(&xml).unwrap(), Some(payload.to_vec()));
        }
    }

    #[test]
    fn keeps_legacy_face_diff_v4_usable_in_pes_2021_but_fails_closed_for_pes_2017() {
        let v4 = v4_fixture();
        let v5 = v5_fixture();
        let mut v6 = v5.clone();
        v6[4..8].copy_from_slice(&6u32.to_le_bytes());
        assert!(validate_face_diff_generation(&v4, 2017).is_ok());
        assert!(validate_face_diff_generation(&v4, 2021).is_ok());        assert!(validate_face_diff_generation(&v5, 2017).is_err());
        assert!(validate_face_diff_generation(&v5, 2021).is_ok());
        assert!(validate_face_diff_generation(&v6, 2017).is_err());
        assert!(validate_face_diff_generation(&v6, 2021).is_ok());
        assert!(validate_face_diff_generation(&v4, 2020).is_err());
    }

    #[test]
    fn fox_face_diff_is_preserved_byte_for_byte_in_pes2017_legacy_xml() {
        let source = v5_fixture();
        validate_face_diff_payload(&source).unwrap();
        // The pre-Fox compiler's face.xml <dif> is a transport representation,
        // not a reason to rewrite the opaque facial calibration payload.
        let xml = legacy_face_xml(Some(&source), &["face_high".into()]).unwrap();
        assert_eq!(legacy_face_diff_from_xml(&xml).unwrap(), Some(source));
    }

    #[test]
    fn base64_encoding_matches_known_vector() {
        assert_eq!(base64_encode(b"FACE"), "RkFDRQ==");
    }

    #[test]
    fn reads_legacy_xml_dif_payload_for_reverse_conversion() {
        let source = v4_fixture();
        let encoded = base64_encode(&source);
        let xml = format!("<?xml version=\"1.0\"?><config><dif>\n{encoded}\n</dif></config>");
        assert_eq!(legacy_face_diff_from_xml(xml.as_bytes()).unwrap(), Some(source));
        assert_eq!(legacy_face_diff_from_xml(b"<config/>").unwrap(), None);
    }

    #[test]
    fn rejects_ambiguous_or_invalid_legacy_xml_dif_payloads() {
        assert!(legacy_face_diff_from_xml(b"<config><dif>AAAA</dif><dif>AAAA</dif></config>").is_err());
        assert!(legacy_face_diff_from_xml(b"<config><dif>not-base64!</dif></config>").is_err());
        assert!(legacy_face_diff_from_xml(b"<config><dif><nested/></dif></config>").is_err());
    }

    #[test]
    fn wraps_face_diff_and_registers_supported_face_models() {
        let source = v5_fixture();
        let xml = legacy_face_xml(Some(&source), &["face_high".into(), "hair_high".into(), "oral".into()]).unwrap();
        let text = String::from_utf8(xml).unwrap();
        assert!(text.contains("type=\"face_neck\""));
        assert!(text.contains("type=\"parts\""));
        assert!(text.contains("oral_hair_high_*.model"));
        assert!(text.contains("oral_oral_*.model"));
        assert!(text.contains("<dif>"));
        assert!(text.contains("RkFDRQ"));
        let without_diff = String::from_utf8(legacy_face_xml(None, &["face_high".into()]).unwrap()).unwrap();
        assert!(!without_diff.contains("<dif>"));
    }

    #[test]
    fn rejects_unknown_models_truncated_payloads_and_unknown_versions() {
        assert!(legacy_face_xml(Some(&v4_fixture()), &["head".into()]).is_err());
        let source = v5_fixture();
        assert!(legacy_face_xml(Some(&source[..100]), &["face_high".into()]).is_err());
        let mut bad = source;
        bad[4..8].copy_from_slice(&9u32.to_le_bytes());
        assert!(validate_face_diff_payload(&bad).is_err());
    }
}

#[cfg(test)]
mod face_source_path_tests {
    use super::{companion_fmdl_for_skeleton, is_face_archive_extension};

    #[test]
    fn accepts_fpk_fpkd_and_kpfd_archive_extensions() {
        assert!(is_face_archive_extension("fpk"));
        assert!(is_face_archive_extension("fpkd"));
        assert!(is_face_archive_extension("kpfd"));
        assert!(!is_face_archive_extension("cpk"));
        assert!(!is_face_archive_extension("fmdl"));
    }

    #[test]
    fn pairs_hair_simulation_skeleton_with_fcl_hair_model() {
        assert_eq!(
            companion_fmdl_for_skeleton(std::path::Path::new("Players/05 - A/fcl_hair_sim.skl")),
            std::path::PathBuf::from("Players/05 - A/fcl_hair.fmdl")
        );
    }

    #[test]
    fn pairs_ordinary_skeleton_with_same_stem_model() {
        assert_eq!(
            companion_fmdl_for_skeleton(std::path::Path::new("Players/05 - A/face_high.skl")),
            std::path::PathBuf::from("Players/05 - A/face_high.fmdl")
        );
    }
}
#[cfg(test)]
mod pes2017_target_id_tests {
    use super::split_pes2017_target_player_id;

    #[test]
    fn accepts_valid_pes2017_team_and_slot_ids() {
        assert_eq!(split_pes2017_target_player_id("70105").unwrap(), ("701", "05"));
        assert_eq!(split_pes2017_target_player_id("92099").unwrap(), ("920", "99"));
    }

    #[test]
    fn rejects_source_face_ids_and_out_of_range_team_prefixes() {
        for id in ["15958", "70005", "92105", "99999", "71400", "71424", "71499", "1234", "abcde"] {
            assert!(split_pes2017_target_player_id(id).is_err(), "{id}");
        }
    }
}
