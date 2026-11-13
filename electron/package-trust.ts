/**
 * Release trust roots. Populate these only with the publisher's independently
 * verified production hostname and Ed25519 public key. Empty defaults fail closed.
 * Never load trust roots from renderer input or a package being installed.
 */
export const FACE_FORGE_PACKAGE_TRUST={
 hosts:[] as readonly string[],
 publicKeys:{} as Readonly<Record<string,string>>
} as const;
