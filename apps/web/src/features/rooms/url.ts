import { appUrl } from '@/lib/share'

/** Link that opens (and joins) a room. Also inside the room QR. */
export const roomUrl = (code: string) => appUrl(`/games/rooms/${code}`)
/** Opens this room's Board Screen (an iPad on the table). */
export const boardUrl = (code: string) => appUrl(`/games/rooms/${code}/board`)
