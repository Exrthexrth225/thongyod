import { appUrl } from '@/lib/share'

/** Link that opens (and joins) a room. Also inside the room QR. */
/** `?g=boss` lets the join screen show the game's look before the visitor has a nickname. */
export const roomUrl = (code: string, game?: string) => appUrl(`/games/rooms/${code}${game === 'boss' ? '?g=boss' : ''}`)
/** Opens this room's Board Screen (an iPad on the table). */
export const boardUrl = (code: string) => appUrl(`/games/rooms/${code}/board`)
