# FACE FORGE v0.2.3

## Performance and face-folder handling
- Inventory and hash regular files across the selected face folder, including assets with unknown extensions, within the documented inspection limits.
- Count embedded archive members in the inspection budget and preserve unknown auxiliary sidecars in the generated player CPK.
- Reinspect the source immediately before conversion and report malformed or unreadable model files before invoking the native compiler.
- Reduce preview model workload, cache repeated DDS texture decoding, and improve material-aware eye and occlusion fallbacks.
- Reduce WebGL rendering overhead and improve responsive scrolling.
- Allow conversion to proceed once source inventory is ready without waiting for optional 3D preview rendering.

## Diagnostics
- Surface native process exit code, stderr, and stdout when conversion fails so compiler errors are actionable.

This release is built and published by the Windows release workflow after installer and updater metadata verification.
