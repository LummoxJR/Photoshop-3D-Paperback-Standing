# Photoshop-3D-Paperback-Standing

This script lets you turn a book cover file into a 3D image of a book using Photoshop or Photoshop Elements. The result will be a paperback book in a standing position.

Just follow these steps:

1. Open a flattened copy of your cover image in Photoshop or Elements.

2. Open this script file, or a copy of it, in a text editor to specify the book's width in inches, amount of bleed in the image, whether the spine and back cover are included, and other details.

3. Open the script file in Photoshop/Elements.

The resulting image will have layers for each of the visible faces of the book, a shadow, and a simple backdrop.

I release this script into the public domain to modify or copy as you see fit. If you have any suggestions or make interesting changes, please let me know; I'd love to see them.

**Suggestions for future refinements:**

* Some of the book's shadow bleeds underneath the front of the book after blur is applied. It doesn't really show, but it would be best to cut it off somehow.

* The lighting uses an infinit-distance source (like the sun). A point light would be able to show a difference between glossy and matte covers, which this script doesn't handle, but calculating a nice gradient to represent the lighting across each face seemed like overkill. If you want to add that, have at it.

* This script only handles a single book, so the shadow won't take into account if there's another book close by that it might fall across. A parameter to specify the position of a second book, and an adjustment to the shadow layer, would be interesting. I may add that myself at some point.