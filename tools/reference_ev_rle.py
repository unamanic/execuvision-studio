"""ExecuVision backward suffix-count RLE, inferred from authorized samples.

Input is compressed raster only (no dimensions or record header/footer).
All counts and output lengths are checked. Original bytes are never mutated.
"""

def decompress(stream: bytes, expected: int) -> bytes:
    if not 0 <= expected <= 16_000_000:
        raise ValueError('Unreasonable raster size')
    pos = len(stream) - 1
    reverse = bytearray()

    def count(run=False):
        nonlocal pos
        total = 0
        while True:
            if pos < 0:
                raise ValueError('Truncated suffix count')
            b = stream[pos]
            pos -= 1
            total += b & 127
            if total > expected + 64:
                raise ValueError('Count exceeds output limit')
            if not b & 128:
                flag = run and bool(b & 64)
                return total - (64 if flag else 0), flag

    literal, _ = count()
    while True:
        if literal > pos + 1 or len(reverse) + literal > expected:
            raise ValueError('Literal count out of bounds')
        if literal:
            reverse.extend(stream[pos-literal+1:pos+1][::-1])
            pos -= literal
        if pos < 0:
            break
        run, has_literal = count(True)
        literal = count()[0] if has_literal else 0
        if pos < 0 or run == 0 or len(reverse) + run > expected:
            raise ValueError('Run count out of bounds')
        reverse.extend([stream[pos]] * run)
        pos -= 1
    if len(reverse) != expected:
        raise ValueError(f'Decoded {len(reverse)} bytes, expected {expected}')
    return bytes(reverse[::-1])


def decode_ev(data: bytes) -> dict:
    """Decode first raster record. Later slide records remain uninterpreted."""
    import struct
    if len(data) < 59:
        raise ValueError('Truncated EV file')
    kind, outer_size = struct.unpack_from('<HH', data)
    if kind not in (1, 2):
        raise ValueError('Unsupported EV kind')
    record_size, height = struct.unpack_from('<HH', data, 50)
    end = 51 + record_size
    if record_size < 3 or end + 4 > len(data):
        raise ValueError('Raster record bounds invalid')
    bits, stored_size = struct.unpack_from('<HH', data, end)
    if bits == 0 or bits % 2 or not 0 < height <= 200:
        raise ValueError('Invalid dimensions')
    width = bits // 2
    stride = (bits + 7) // 8
    expected = stride * height
    if stored_size != expected + 3:
        raise ValueError('Uncompressed size/dimensions disagree')
    bitmap = decompress(data[54:end], expected)
    pixels = bytes((bitmap[y*stride+x//4] >> (6-2*(x%4))) & 3
                   for y in range(height) for x in range(width))
    return dict(kind=kind, width=width, height=height, stride=stride,
                bitmap=bitmap, pixels=pixels, raster_end=end+4,
                outer_size=outer_size, compressed_size=end-54)
