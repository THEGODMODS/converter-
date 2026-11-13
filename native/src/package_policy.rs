/// Validates the complete member set that the current Fox-to-PES2017 path can
/// actually consume. This is deliberately fail-closed: a member is accepted only
/// when the native conversion path reads it and emits a corresponding target file.
pub fn validate_face_package_members(paths: &[String]) -> Result<(), String> {
    use std::collections::HashSet;

    let mut folded = HashSet::new();
    for path in paths {
        let lower = path.to_ascii_lowercase();
        if !folded.insert(lower.clone()) {
            return Err(format!("Duplicate case-insensitive package member: {path}"));
        }
        if !lower.ends_with(".fmdl") && !lower.ends_with(".skl") {
            return Err(format!(
                "Unhandled package member: {path}. This build can only convert FMDL and paired SKL model members. FTEX textures, FACE diff, XML, FOX scene and unknown sidecars are blocked because their package-wide conversion/preservation path is not implemented."
            ));
        }
    }

    // An SKL is not allowed to disappear as an unreferenced archive member.
    // The current bridge pairs it by the FMDL's virtual path and basename.
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

#[cfg(test)]
mod tests {
    use super::validate_face_package_members;

    #[test]
    fn accepts_model_members_with_a_real_native_output_path() {
        let paths = vec![
            "Assets/face/head.fmdl".to_string(),
            "Assets/face/head.skl".to_string(),
            "Assets/face/hair.fmdl".to_string(),
        ];
        assert!(validate_face_package_members(&paths).is_ok());
    }

    #[test]
    fn rejects_texture_and_metadata_sidecars_not_yet_converted_or_preserved() {
        for sidecar in [
            "Assets/face/skin.ftex",
            "Assets/face/face_diff.bin",
            "Assets/face/player.xml",
            "Assets/face/scene.fox2",
            "Assets/face/config.json",
            "Assets/face/unknown.dat",
        ] {
            let paths = vec!["Assets/face/head.fmdl".to_string(), sidecar.to_string()];
            assert!(
                validate_face_package_members(&paths).is_err(),
                "must reject unhandled sidecar: {sidecar}"
            );
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
        let paths = vec![
            "Assets/face/HEAD.FMDL".to_string(),
            "Assets/face/head.SKL".to_string(),
        ];
        assert!(validate_face_package_members(&paths).is_ok());
    }

    #[test]
    fn rejects_case_insensitive_duplicate_virtual_paths() {
        let paths = vec![
            "Assets/face/head.fmdl".to_string(),
            "Assets/face/HEAD.FMDL".to_string(),
        ];
        assert!(validate_face_package_members(&paths).unwrap_err().contains("Duplicate"));
    }
}
