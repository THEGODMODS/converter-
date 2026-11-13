/// Package-member allowlist for the currently implemented cross-generation model path.
///
/// This is deliberately fail-closed: accepting a member here means the conversion
/// pipeline has an explicit reader/writer path for it. Add a new extension only
/// alongside its converter or byte-preserving package handling and tests.
pub fn is_supported_face_package_member(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    [".fmdl", ".skl", ".ftex"].iter().any(|ext| lower.ends_with(ext))
}

#[cfg(test)]
mod tests {
    use super::is_supported_face_package_member;

    #[test]
    fn accepts_only_members_with_an_implemented_conversion_path() {
        for path in [
            "face/head.fmdl",
            "face/HEAD.FMDL",
            "face/rig.skl",
            "face/textures/skin.ftex",
            "skin.FTEX",
        ] {
            assert!(is_supported_face_package_member(path), "expected supported: {path}");
        }
    }

    #[test]
    fn rejects_sidecars_until_their_semantics_are_handled_or_preserved() {
        for path in [
            "face/face_diff.bin",
            "face/player.xml",
            "face/scene.fox",
            "face/config.json",
            "face/unknown.dat",
            "face/no-extension",
        ] {
            assert!(!is_supported_face_package_member(path), "expected fail-closed rejection: {path}");
        }
    }

    #[test]
    fn rejects_extension_lookalikes() {
        for path in ["face.fmdl.bak", "face.sklx", "face.ftex.tmp"] {
            assert!(!is_supported_face_package_member(path), "must not accept suffix lookalike: {path}");
        }
    }
}
