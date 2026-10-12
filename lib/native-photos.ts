import { isNativeApp } from '@/lib/runtime'

export type NativePhotoDestination = 'gallery' | 'share'

// A true result means the gallery save or share handoff completed. The optional
// callback lets the UI distinguish those outcomes without claiming a share saved.
export async function savePhotoNative(
  dataUrl: string,
  filename: string,
  onComplete?: (destination: NativePhotoDestination) => void,
): Promise<boolean> {
  if (!isNativeApp()) return false

  const fileName = filename.replace(/[/\\]/g, '-').replace(/\.jpe?g$/i, '') || 'pose-photo'
  let destination: NativePhotoDestination
  try {
    const [{ Media }, { Capacitor }] = await Promise.all([
      import('@capacitor-community/media'),
      import('@capacitor/core'),
    ])
    const albumsPath = Capacitor.getPlatform() === 'android'
      ? (await Media.getAlbumsPath()).path.replace(/\/+$/, '') + '/'
      : null
    const findAlbum = async () => {
      const { albums } = await Media.getAlbums()
      return albums.find((album) => album.name === 'Pose Guide' && (
        albumsPath === null || album.identifier.startsWith(albumsPath)
      ))
    }
    let album = await findAlbum()
    if (!album) {
      await Media.createAlbum({ name: 'Pose Guide' })
      album = await findAlbum()
    }
    if (!album) throw new Error('Pose Guide album unavailable')
    await Media.savePhoto({ path: dataUrl, albumIdentifier: album.identifier, fileName })
    destination = 'gallery'
  } catch {
    try {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ])
      const base64 = dataUrl.match(/^data:image\/jpeg;base64,(.+)$/)?.[1]
      if (!base64) return false
      const { uri } = await Filesystem.writeFile({
        path: `${fileName}.jpg`,
        data: base64,
        directory: Directory.Cache,
      })
      await Share.share({ files: [uri], title: 'Pose Guide' })
      destination = 'share'
    } catch {
      return false
    }
  }
  onComplete?.(destination)
  return true
}
