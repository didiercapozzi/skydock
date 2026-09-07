# TODO

## Thumbnail Filmstrip on Crop Bar — implemented

### Overview

Small image previews along the video timebar in VideoCropper show visual context when seeking. A new `/api/thumb/` endpoint extracts single JPEG frames via ffmpeg.

### Implementation

#### 1. Create `web/app/routes/api.thumb.$.tsx`

New endpoint: `/api/thumb/{path}?seek=12.5&width=160`

- Extract single frame using ffmpeg: `ffmpeg -ss {seek} -i "{path}" -frames:v 1 -vf "scale={width}:-1" -f imagejpeg pipe:out`
- Return `Content-Type: image/jpeg`, `Cache-Control: max-age=31536000` (immutable, same file+seek = same thumb)
- Handle errors: invalid path, seek out of range, ffmpeg not available → 404
- ~40 lines of code

#### 2. Register route in `web/app/routes.ts`

Add: `route('api/thumb/*', 'routes/api.thumb.$.tsx')`

#### 3. Modify `web/app/components/video-cropper.tsx`

- Calculate visible time range from `offset`, `visibleDuration`, `duration`
- Determine thumbnail count: `Math.floor(barWidth / 80)` (one thumb per ~80px)
- For each thumbnail position, compute time offset and build thumb URL
- Render `<img>` elements inside the `data-crop-bar` div, absolutely positioned
- Use `onLoad`/`onError` to handle loading states
- Hide thumbnails when zoom < 1x (they'd be too dense to be useful)

#### 4. Tests

- Add test for thumb endpoint: returns JPEG for valid seek
- Add test for thumb endpoint: returns 404 for invalid path
- Add test for VideoCropper: renders thumbnail images when zoomed

### Files

| File                                   | Change                        |
| -------------------------------------- | ----------------------------- |
| `web/app/routes/api.thumb.$.tsx`       | New endpoint                  |
| `web/app/routes.ts`                    | Register route                |
| `web/app/components/video-cropper.tsx` | Add thumbnail strip rendering |
| `web/tests/home.test.tsx`              | Add tests                     |
