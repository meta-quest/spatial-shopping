# Third-Party Assets

Source code in this repository is licensed under the MIT license (see
`LICENSE`). Some data and media files are third-party works distributed under
their own licenses, listed below. Trademarks remain the property of their
respective owners.

## Amazon Berkeley Objects (ABO)

Contains material from the
[Amazon Berkeley Objects (ABO) dataset](https://amazon-berkeley-objects.s3.amazonaws.com/index.html)
© Amazon.com, Inc., licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

ABO-derived files in this repository:

- `public/demo/imgs/B07H469871.webp`
- `public/demo/imgs/B071LD87KZ.webp`
- `public/demo/imgs/B073P1CJGC.webp`
- `public/demo/imgs/B07B8PXMTK.webp`
- `public/og-image.png` (social preview that includes the `B07H469871` and
  `B071LD87KZ` catalog images)
- `docs/images/catalog.webp` (README screenshot that includes the ABO catalog
  images)

Modifications: the catalog images were converted, resized, and re-encoded
to WebP for web delivery, and the ABO listing metadata for these
items was adapted to the demo's product catalog schema in
`public/demo/data/vendor-products.json`.

The demo also loads the unmodified ABO 3D models for items `B07H469871`,
`B071LD87KZ`, `B073P1CJGC`, and `B07B8PXMTK` at runtime from the ABO S3 bucket.
These models are not redistributed in this repository.

## Semantic Labels

`src/framework/data/semantic-labels.json` is a copy of `labels.json` from
[immersive-web/semantic-labels](https://github.com/immersive-web/semantic-labels),
© the semantic-labels contributors, licensed under the
[W3C Software and Document License](https://www.w3.org/copyright/software-license-2023/).
The file is re-serialized (reformatted) by `npm run update:semantic-labels`;
its content is otherwise unmodified. The license notice follows.

> This work is being provided by the copyright holders under the following
> license.
>
> **License**
>
> By obtaining and/or copying this work, you (the licensee) agree that you have
> read, understood, and will comply with the following terms and conditions.
>
> Permission to copy, modify, and distribute this work, with or without
> modification, for any purpose and without fee or royalty is hereby granted,
> provided that you include the following on ALL copies of the work or portions
> thereof, including modifications:
>
> - The full text of this NOTICE in a location viewable to users of the
>   redistributed or derivative work.
> - Any pre-existing intellectual property disclaimers, notices, or terms and
>   conditions. If none exist, the W3C software and document short notice
>   should be included.
> - Notice of any changes or modifications, through a copyright statement on
>   the new code or document such as "This software or document includes
>   material copied from or derived from [title and URI of the W3C document].
>   Copyright © [$year-of-document] World Wide Web Consortium.
>   https://www.w3.org/copyright/software-license-2023/"
>
> **Disclaimers**
>
> THIS WORK IS PROVIDED "AS IS," AND COPYRIGHT HOLDERS MAKE NO REPRESENTATIONS
> OR WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO, WARRANTIES OF
> MERCHANTABILITY OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF THE
> SOFTWARE OR DOCUMENT WILL NOT INFRINGE ANY THIRD PARTY PATENTS, COPYRIGHTS,
> TRADEMARKS OR OTHER RIGHTS.
>
> COPYRIGHT HOLDERS WILL NOT BE LIABLE FOR ANY DIRECT, INDIRECT, SPECIAL OR
> CONSEQUENTIAL DAMAGES ARISING OUT OF ANY USE OF THE SOFTWARE OR DOCUMENT.
>
> The name and trademarks of copyright holders may NOT be used in advertising or
> publicity pertaining to the work without specific, written prior permission.
> Title to copyright in this work will at all times remain with copyright
> holders.

## Poly Haven HDRI

`public/hdr/poly_haven_studio_1k.hdr` is the 1K version of the
[Poly Haven Studio](https://polyhaven.com/a/poly_haven_studio) HDRI from
[Poly Haven](https://polyhaven.com/), released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

## IWSDK Starter Asset

`public/demo/gltf/plantSansevieria/` is derived from the plant asset distributed
by `@iwsdk/create` 0.4.2 in the
[Immersive Web SDK](https://github.com/facebook/immersive-web-sdk), MIT License,
© Meta Platforms, Inc. and affiliates.

## Project Assets

All other media were created for this project and are distributed under the
repository MIT license, including:

- the lounge chair model and textures in `public/demo/gltf/loungeChair/`
- the lounge chair and plant catalog images
  (`public/demo/imgs/lounge-chair*.webp`,
  `public/demo/imgs/sansevieria-plant.webp`)
- the UI artwork in `public/imgs/`
- the arrow models in `public/3dUI/`
