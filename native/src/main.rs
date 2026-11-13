use std::{env, fs, path::{Path,PathBuf}, process};
mod package_policy;
use package_policy::{ftex_target_path, normalize_fox_virtual_path, validate_face_package_members};
use fmdl::{format::{FmdlFile,SklFile}, Model as FoxModel};
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

/// Wraps a validated Fox FACE calibration payload in the legacy PES XML <dif>
/// element. The payload is preserved byte-for-byte; no unverified rig-space
/// transform or v5-to-v4 record remapping is attempted.
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

fn legacy_face_xml(face_diff: Option<&[u8]>, model_stems: &[String]) -> Result<Vec<u8>, String> {
    if let Some(face_diff) = face_diff {
    if face_diff.len() < 0x50 || &face_diff[..4] != b"FACE" {
        return Err("FACE diff sidecar has an invalid or truncated header.".into());
    }
    let version = u32::from_le_bytes(face_diff[4..8].try_into().unwrap());
    let count_a = u32::from_le_bytes(face_diff[0x48..0x4c].try_into().unwrap()) as usize;
    let count_b = u32::from_le_bytes(face_diff[0x4c..0x50].try_into().unwrap()) as usize;
    let known = (version == 5 || version == 6) && count_a == 33 && count_b == 6
        || version == 4 && count_a == 32 && count_b == 6;
    if !known {
        return Err(format!("FACE diff version/count combination is not supported for XML preservation: v{version}, {count_a}/{count_b}."));
    }
    let required = 0xf0usize.checked_add(count_a * 0x10).and_then(|v| v.checked_add(count_b * 0x20))
        .ok_or("FACE diff record size overflow.")?;
    if face_diff.len() < required {
        return Err(format!("FACE diff is truncated: {} bytes, expected at least {required}.", face_diff.len()));
    }
    let offset_count = count_a + count_b;
    let mut seen = std::collections::HashSet::new();
    let mut ranges: Vec<(usize, usize)> = Vec::with_capacity(offset_count);
    for i in 0..offset_count {
        let at = 0x50 + i * 4;
        let offset = u32::from_le_bytes(face_diff[at..at + 4].try_into().unwrap()) as usize;
        let record_size = if i < count_a { 0x10 } else { 0x20 };
        let end = offset.checked_add(record_size).ok_or("FACE diff record range overflow.")?;
        if offset < 0xf0 || offset % 16 != 0 || end > required || !seen.insert(offset) {
            return Err(format!("FACE diff record pointer {i} is invalid, unaligned, out of range or duplicated."));
        }
        ranges.push((offset, end));
    }
    ranges.sort_unstable_by_key(|range| range.0);
    for pair in ranges.windows(2) {
        if pair[1].0 < pair[0].1 {
            return Err("FACE diff records overlap.".into());
        }
    }
    for at in (0x08..0x48).step_by(4) {
        let value = f32::from_le_bytes(face_diff[at..at + 4].try_into().unwrap());
        if !value.is_finite() {
            return Err("FACE diff header contains a non-finite calibration value.".into());
        }
    }
    for i in 0..offset_count {
        let offset_at = 0x50 + i * 4;
        let offset = u32::from_le_bytes(face_diff[offset_at..offset_at + 4].try_into().unwrap()) as usize;
        let float_count = if i < count_a { 4 } else { 8 };
        for j in 0..float_count {
            let at = offset + j * 4;
            let value = f32::from_le_bytes(face_diff[at..at + 4].try_into().unwrap());
            if !value.is_finite() {
                return Err(format!("FACE diff record {i} contains a non-finite value."));
            }
        }
    }
    }
    let has_face = model_stems.iter().any(|s| s.eq_ignore_ascii_case("face_high"));
    if !has_face {
        return Err("A FACE diff cannot be attached to a legacy XML without a face_high model.".into());
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
fn run()->Result<(),String>{
 let args:Vec<String>=env::args().collect();
 if args.get(1).map(String::as_str)==Some("convert-texture"){
  let input=PathBuf::from(required(&args,"--input")?);let output=PathBuf::from(required(&args,"--out")?);let direction=required(&args,"--direction")?;let color=match optional(&args,"--color-space").as_deref().unwrap_or("srgb"){"srgb"=>ColorSpace::Srgb,"linear"=>ColorSpace::Linear,"normal"=>ColorSpace::Normal,_=>return Err("Color space must be srgb, linear or normal".into())};let bytes=fs::read(&input).map_err(|e|format!("Read texture: {e}"))?;
  let result=match direction.as_str(){"ftex-to-dds"=>ftex_to_dds(&bytes).map_err(|e|format!("FTEX decode: {e}"))?,"dds-to-ftex"=>dds_to_ftex(&bytes,color).map_err(|e|format!("DDS encode: {e}"))?,_=>return Err("Texture direction must be ftex-to-dds or dds-to-ftex".into())};
  if direction=="ftex-to-dds"{let _=ftex_info(&bytes).map_err(|e|format!("FTEX validation: {e}"))?;}else{let _=ftex_info(&result).map_err(|e|format!("Generated FTEX validation: {e}"))?;}
  write(&output,&result)?;println!("{}",serde_json::json!({"ok":true,"bytes":result.len()}));return Ok(());
 }
 if args.get(1).map(String::as_str)!=Some("convert-model"){return Err("Usage: face-forge-native convert-model ... | convert-texture --input FILE --direction ftex-to-dds|dds-to-ftex --color-space srgb|linear|normal --out FILE".into());}
 let source_format=required(&args,"--source-format")?;let target_text=required(&args,"--target")?;let out=PathBuf::from(required(&args,"--out")?);
 let model_paths:Vec<PathBuf>=args.iter().enumerate().filter(|(_,arg)|arg.as_str()=="--model").filter_map(|(i,_)|args.get(i+1)).map(PathBuf::from).collect();
 if model_paths.is_empty(){return Err("At least one --model input is required.".into());}
 let target:u16=target_text.parse().map_err(|_|"Target must be 2017 or 2021".to_string())?;if target!=2017&&target!=2021{return Err("Target must be 2017 or 2021".into());}
 for path in &model_paths{if !path.is_file(){return Err(format!("Source model does not exist: {}",path.display()));}}
 if source_format=="fpk"&&(model_paths.is_empty()||model_paths.len()>2){return Err("Supply one face FPK and optionally its paired FPKD archive.".into());}
 let textures_managed_externally=args.iter().any(|arg|arg=="--textures-managed-externally");
 let mut package_textures:Vec<(String,Vec<u8>)>=Vec::new();
 let mut package_face_diff:Option<Vec<u8>>=None;
 let bundles:Vec<(String,NativeModelBundle)>=match source_format.as_str(){
  "fpk"=>{
   if target!=2017{return Err("A PES 2021 Fox package source must target PES 2017.".into());}
   let mut archive_entries:Vec<(String,Vec<u8>)>=Vec::new();let mut seen=std::collections::HashSet::new();
   for archive_path in &model_paths{
    let bytes=fs::read(archive_path).map_err(|e|format!("Read source Fox archive {}: {e}",archive_path.display()))?;
    let archive=FpkFile::read(&bytes).map_err(|e|format!("Decode source FPK/FPKD {}: {e}",archive_path.display()))?;
    for (name,data) in archive.entries(){
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
    let file=model.to_file().map_err(|e|format!("Encode PES 2021 FMDL {stem}: {e}"))?;let model_bytes=file.write();
    let checked_file=FmdlFile::read(&model_bytes).map_err(|e|format!("PES 2021 FMDL read-back failed for {stem}: {e}"))?;
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
  let xml=legacy_face_xml(package_face_diff.as_deref(),&model_stems)?;
  outputs.push("face.xml".into());
  pending_outputs.push(("face.xml".into(),xml));
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
    use super::{base64_encode, legacy_face_xml};

    fn fixture() -> Vec<u8> {
        let mut data = vec![0u8; 960];
        data[..4].copy_from_slice(b"FACE");
        data[4..8].copy_from_slice(&5u32.to_le_bytes());
        data[0x48..0x4c].copy_from_slice(&33u32.to_le_bytes());
        data[0x4c..0x50].copy_from_slice(&6u32.to_le_bytes());
        for i in 0..39 {
            let offset = if i < 33 { 0xf0 + i * 0x10 } else { 0x300 + (i - 33) * 0x20 };
            data[0x50 + i * 4..0x54 + i * 4].copy_from_slice(&(offset as u32).to_le_bytes());
        }
        data
    }

    #[test]
    fn base64_encoding_matches_known_vector() {
        assert_eq!(base64_encode(b"FACE"), "RkFDRQ==");
    }

    #[test]
    fn wraps_v5_face_diff_and_registers_supported_face_models() {
        let xml = legacy_face_xml(Some(&fixture()), &["face_high".into(), "hair_high".into(), "oral".into()]).unwrap();
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
    fn rejects_unknown_models_and_truncated_or_unknown_face_diff() {
        assert!(legacy_face_xml(Some(&fixture()), &["head".into()]).is_err());
        assert!(legacy_face_xml(Some(&fixture()[..100]), &["face_high".into()]).is_err());
        let mut bad = fixture();
        bad[4..8].copy_from_slice(&9u32.to_le_bytes());
        assert!(legacy_face_xml(Some(&bad), &["face_high".into()]).is_err());
    }
}
