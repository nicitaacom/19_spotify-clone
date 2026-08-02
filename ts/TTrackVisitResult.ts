/**
 * What `trackVisitAction` answers with. Written out as two shapes rather than inferred: an inferred
 * union gives the first shape an optional `storedDeviceId?: undefined`, and `"storedDeviceId" in
 * trackVisitResp` then tells the client nothing about which shape it actually got.
 *
 * `{ needsFingerprint: true }` means layers 1-3 all missed and the browser should compute its
 * fingerprint and call again. `{ storedDeviceId }` means the visit is recorded - the transport form of
 * the winning deviceId, ready for `useDeviceIdStore`.
 */
export type TTrackVisitResult = { needsFingerprint: true } | { storedDeviceId: string }
