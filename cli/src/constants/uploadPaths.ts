import { join } from 'path'
import { tmpdir } from 'os'

export const ORBIX_BLOBS_DIR_NAME = 'orbix-blobs'

export function getOrbixBlobsDir(): string {
    return join(tmpdir(), ORBIX_BLOBS_DIR_NAME)
}
