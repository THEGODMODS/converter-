/// Normalize the canonical Fox archive name form `/Assets/...` into a
/// safe project-relative virtual path before writing into the output directory.
pub fn normalize_fox_virtual_path(path: &str) -> Result<String, String> {
    let normalized = if let Some(rest) = path.strip_prefix("/Assets/") {
        format!("Assets/{rest}")
    } else if path.starts_with('/') {
        return Err(format!("Unsafe absolute Fox package virtual path: {path}"));
    } else {
        path.to_string()
    };
    if normalized.is_empty()
        || normalized.contains('\\')
        || normalized.split('/').any(|part| part.is_empty() || part == "." || part == ".." || part.contains(':'))
    {
        return Err(format!("Unsafe Fox package virtual path: {path}"));
    }
    Ok(normalized)
}

/// Validates every Fox package member before any conversion output is written.
/// Accepted extensions must have an explicit conversion and output path below.
pub fn validate_face_package_members(paths: &[String]) -> Result<(), String> {
    use std::collections::HashSet;

    let mut folded = HashSet::new();
    for path in paths {
        let lower = path.to_ascii_lowercase();
        if path.is_empty()
            || path.starts_with('/')
            || path.contains('\\')
            || path.split('/').any(|part| part.is_empty() || part == "." || part == ".." || part.contains(':'))
        {
            return Err(format!("Unsafe Fox package virtual path: {path}"));
        }
        if !folded.insert(lower.clone()) {
            return Err(format!("Duplicate case-insensitive package member: {path}"));
        }
        if !lower.ends_with(".fmdl") && !lower.ends_with(".skl") && !lower.ends_with(".ftex") {
            return Err(format!(
                "Unhandled package member: {path}. This build converts FMDL, paired SKL and FTEX members. FACE diff, XML, FOX scene and unknown sidecars remain blocked until their semantics are converted or preserved."
            ));
        }
    }

    for path in paths.iter().filter(|p| p.to_ascii_lowercase().ends_with(".skl")) {
        let stem = path.rsplit_once('.').map(|(stem, _)| stem).unwrap_or(path);
        let expected = format!("{stem}.fmdl").to_ascii_lowercase();
        if !folded.contains(&expected) {
            return Err(format!(
                "Orphan skeleton member: {path}. Expected a companion FMDL at the same virtual path."
            ));
        }
    }

    Ok(())
}

/// The package converter preserves the virtual directory and changes only the
/// texture container extension; this keeps material sampler paths resolvable.
pub fn ftex_target_path(path: &str) -> Result<String, String> {
    if !path.to_ascii_lowercase().ends_with(".ftex") {
        return Err(format!("Expected an FTEX package member: {path}"));
    }
    let stem = path.rsplit_once('.').map(|(stem, _)| stem).unwrap_or(path);
    Ok(format!("{stem}.dds"))
}

#[cfg(test)]
mod tests {
    use super::{ftex_target_path, normalize_fox_virtual_path, validate_face_package_members};

    #[test]
    fn normalizes_canonical_fox_assets_root_without_accepting_other_absolute_paths() {
        assert_eq!(normalize_fox_virtual_path("/Assets/face/head.fmdl").unwrap(), "Assets/face/head.fmdl");
        assert!(normalize_fox_virtual_path("/root/head.fmdl").is_err());
    }

    #[test]
    fn accepts_model_skeleton_and_texture_members() {
        let paths = vec![
            "Assets/face/head.fmdl".to_string(),
            "Assets/face/head.skl".to_string(),
            "Assets/face/hair.fmdl".to_string(),
            "Assets/sourceimages/skin.ftex".to_string(),
        ];
        assert!(validate_face_package_members(&paths).is_ok());
    }

    #[test]
    fn rejects_unhandled_metadata_and_scene_sidecars() {
        for sidecar in [
            "Assets/face/face_diff.bin",
            "Assets/face/player.xml",
            "Assets/face/scene.fox2",
            "Assets/face/config.json",
            "Assets/face/unknown.dat",
        ] {
            let paths = vec!["Assets/face/head.fmdl".to_string(), sidecar.to_string()];
            assert!(validate_face_package_members(&paths).is_err(), "must reject: {sidecar}");
        }
    }

    #[test]
    fn rejects_unsafe_virtual_paths() {
        for path in ["../outside.ftex", "/root/skin.ftex", "Assets\\skin.ftex", "Assets/../skin.ftex", "C:/skin.ftex"] {
            let paths = vec![path.to_string()];
            assert!(validate_face_package_members(&paths).is_err(), "must reject: {path}");
        }
    }

    #[test]
    fn rejects_orphan_skeleton_instead_of_dropping_it() {
        let paths = vec![
            "Assets/face/head.fmdl".to_string(),
            "Assets/face/extra.skl".to_string(),
        ];
        assert!(validate_face_package_members(&paths).unwrap_err().contains("Orphan skeleton"));
    }

    #[test]
    fn pairs_skeletons_case_insensitively() {
        let paths = vec!["Assets/face/HEAD.FMDL".to_string(), "Assets/face/head.SKL".to_string()];
        assert!(validate_face_package_members(&paths).is_ok());
    }

    #[test]
    fn rejects_case_insensitive_duplicate_virtual_paths() {
        let paths = vec!["Assets/face/head.fmdl".to_string(), "Assets/face/HEAD.FMDL".to_string()];
        assert!(validate_face_package_members(&paths).unwrap_err().contains("Duplicate"));
    }

    #[test]
    fn maps_texture_path_without_flattening_directories() {
        assert_eq!(ftex_target_path("Assets/sourceimages/skin.FTEX").unwrap(), "Assets/sourceimages/skin.dds");
    }

    #[test]
    fn rejects_non_texture_path_mapping() {
        assert!(ftex_target_path("Assets/sourceimages/skin.dds").is_err());
    }
}
