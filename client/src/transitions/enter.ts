import { $Node, motion, styleInline } from "@aelea/dom"
import { combine, now } from "@most/core"

export function fadeIn($content: $Node) {
  const fadeIn = motion({ stiffness: 70, damping: 26, precision: 1 }, 0, now(100))
  const slideIn = motion({ stiffness: 270, damping: 46, precision: 1 }, 25, now(0))

  const animation = styleInline(
    combine((opacity, slide) => {
      return { opacity: opacity === 100 ? '' : `${opacity}%`, transform: slide === 0 ? '' : `translate(0, ${slide}px)` }
    }, fadeIn, slideIn)
  )

  return animation(
    $content
  )
}