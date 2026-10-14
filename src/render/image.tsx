/** The image widget (`Image`): an address through the image policy, an asset of the host or a placeholder. */
import { useContext, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { valueAt } from '../data'
import { ASSET_PLACEHOLDERS, UNKNOWN_ASSET_PLACEHOLDER } from '../icons'
import { imageRatioCssOf } from '../media-chrome'
import { AssetContext } from '../runtime'
import { isRecord, lookup, safeIdent } from '../sanitize'
import { useAltText } from './alt-text'
import { ImageContext, useData } from './contexts'
import type { NodeMark, WidgetProps } from './widget-props'
import { screenPart } from './screen-part'

/**
 * An image: an address from the document, an address from the data, or an asset token.
 *
 * In an image binding `fallback` is an asset TOKEN, not a second address. The placeholder is built
 * into the app: someone else's photo in its place would look like the right answer, while a
 * placeholder honestly says there is no photo.
 *
 * An ASSET is a host resource: the contract names it (`logo`, `banner`) and the host app supplies
 * the file (`assets`). A token without an address is drawn as a placeholder, a block rather than an
 * `<img>` with a broken address: the broken-image icon would read as a network failure.
 */
export const ImageView = screenPart(function ImageView({ props, css, mark }: Pick<WidgetProps, 'props' | 'css'> & { readonly mark?: NodeMark }): ReactNode {
  const scope = useData()
  const assets = useContext(AssetContext)
  const images = useContext(ImageContext)
  const [failedSrc, setFailedSrc] = useState<string | undefined>(undefined)
  // The description is a string or a document string (schema 9.19.0); an empty one makes the image decorative.
  const description = useAltText(props.alt)
  // The source comes from the network: `null`, a string or a number in its place means there is no source.
  if (!isRecord(props.source)) return null
  const source = props.source

  /*
   * An address from the document or from the data goes ONLY through the image policy: an absolute
   * `https:` by default, beyond that the host decides (`resolveImageUrl`). A rejected address
   * (`http:`, `data:`, `javascript:`) never reaches `src`: a placeholder is drawn and the host gets
   * a report.
   */
  const bound = source.kind === 'binding' ? valueAt(scope, source.path) : undefined
  const named = source.kind === 'url' ? source.url : typeof bound === 'string' && bound !== '' ? bound : undefined
  const url = images.src(named, 'image', source.kind === 'url' ? 'document' : 'data')
  const asset = safeIdent(source.kind === 'binding' ? source.fallback : source.asset)
  // The asset address comes from the host (`assets`), so the document image policy does not apply to it.
  const assetUrl = asset === undefined ? undefined : lookup(assets, asset)
  const alt = description ?? ''
  const fit = props.fit === 'contain' ? 'contain' : 'cover'
  const frame: CSSProperties = {
    display: 'block',
    inlineSize: '100%',
    // A named height (`style.height`) is stronger: CSS does not apply `aspect-ratio` to a box with two named sizes.
    aspectRatio: imageRatioCssOf(props.aspectRatio),
  }

  const src = url ?? (typeof assetUrl === 'string' && assetUrl !== '' ? assetUrl : undefined)
  /*
   * An address that FAILED TO LOAD is drawn with the same placeholder as an asset without an
   * address. Otherwise the screen shows the browser's broken-image icon with the `alt` text over the
   * layout, the same "network failure" look described above, only caused by someone else's CDN. We
   * remember exactly the address that failed: a new address (other data, another list record) tries
   * to load again.
   *
   * An image may fail BEFORE hydration (the page was rendered on the server); React then never sees
   * the `error` event, so the state of the element is read the moment it appears.
   */
  if (src !== undefined && failedSrc !== src) {
    // The image radius is `style.radius`: it already lies in `css`.
    return (
      <img
        {...mark}
        ref={(element) => {
          if (element !== null && element.complete && element.naturalWidth === 0 && element.getAttribute('src') === src) setFailedSrc(src)
        }}
        src={src}
        alt={alt}
        onError={() => {
          setFailedSrc(src)
        }}
        style={{ ...frame, objectFit: fit, ...css }}
      />
    )
  }

  const placeholder = lookup(ASSET_PLACEHOLDERS, asset) ?? UNKNOWN_ASSET_PLACEHOLDER
  return (
    <div
      {...mark}
      role="img"
      aria-label={alt === '' ? undefined : alt}
      aria-hidden={alt === '' ? true : undefined}
      data-hl-asset={asset}
      data-hl-image={src === undefined ? undefined : 'failed'}
      style={{ ...frame, backgroundImage: placeholder, backgroundSize: fit, backgroundPosition: 'center', backgroundRepeat: 'no-repeat', ...css }}
    />
  )
})
