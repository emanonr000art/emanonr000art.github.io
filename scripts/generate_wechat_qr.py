from pathlib import Path

EXP = [0] * 512
LOG = [0] * 256
x = 1
for i in range(255):
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if x & 0x100:
        x ^= 0x11D
for i in range(255, 512):
    EXP[i] = EXP[i - 255]

def gf_mul(a: int, b: int) -> int:
    if a == 0 or b == 0:
        return 0
    return EXP[LOG[a] + LOG[b]]

def poly_mul(p, q):
    res = [0] * (len(p) + len(q) - 1)
    for i, pi in enumerate(p):
        if pi == 0:
            continue
        for j, qj in enumerate(q):
            if qj == 0:
                continue
            res[i + j] ^= gf_mul(pi, qj)
    return res

def rs_generator(degree: int):
    g = [1]
    for i in range(degree):
        g = poly_mul(g, [1, EXP[i]])
    return g

def rs_remainder(data, degree: int):
    g = rs_generator(degree)
    res = list(data) + [0] * degree
    for i in range(len(data)):
        coef = res[i]
        if coef == 0:
            continue
        for j in range(len(g)):
            res[i + j] ^= gf_mul(g[j], coef)
    return res[-degree:]

def encode_data(text: str):
    data = text.encode("utf-8")
    bits = []

    def append(value: int, length: int):
        for i in range(length - 1, -1, -1):
            bits.append((value >> i) & 1)

    append(0b0100, 4)
    append(len(data), 8)
    for b in data:
        append(b, 8)
    total_bits = 55 * 8
    remaining = total_bits - len(bits)
    if remaining > 0:
        pad = min(4, remaining)
        bits.extend([0] * pad)
        remaining = total_bits - len(bits)
    if len(bits) % 8 != 0:
        bits.extend([0] * (8 - len(bits) % 8))
    codewords = []
    for i in range(0, len(bits), 8):
        byte = 0
        for bit in bits[i : i + 8]:
            byte = (byte << 1) | bit
        codewords.append(byte)
    pads = [0xEC, 0x11]
    idx = 0
    while len(codewords) < 55:
        codewords.append(pads[idx % 2])
        idx += 1
    return codewords

def build_matrix(data_codewords, ec_codewords):
    size = 29
    matrix = [[None] * size for _ in range(size)]
    function_map = [[False] * size for _ in range(size)]

    def set_module(r: int, c: int, val: int, function: bool = False):
        if not (0 <= r < size and 0 <= c < size):
            raise IndexError(f"module out of bounds: {(r, c)}")
        matrix[r][c] = 1 if val else 0
        function_map[r][c] = function

    def place_finder(r: int, c: int):
        for i in range(-1, 8):
            for j in range(-1, 8):
                rr, cc = r + i, c + j
                if not (0 <= rr < size and 0 <= cc < size):
                    continue
                if 0 <= i <= 6 and 0 <= j <= 6:
                    if i in (0, 6) or j in (0, 6) or (2 <= i <= 4 and 2 <= j <= 4):
                        set_module(rr, cc, 1, True)
                    else:
                        set_module(rr, cc, 0, True)
                else:
                    set_module(rr, cc, 0, True)

    place_finder(0, 0)
    place_finder(0, size - 7)
    place_finder(size - 7, 0)

    for i in range(8, size - 8):
        if matrix[6][i] is None:
            set_module(6, i, i % 2 == 0, True)
        if matrix[i][6] is None:
            set_module(i, 6, i % 2 == 0, True)

    def place_alignment(r: int, c: int):
        for i in range(-2, 3):
            for j in range(-2, 3):
                rr, cc = r + i, c + j
                if not (0 <= rr < size and 0 <= cc < size):
                    continue
                if matrix[rr][cc] is not None:
                    continue
                value = 1 if max(abs(i), abs(j)) in (0, 2) or (i == 0 and j == 0) else 0
                set_module(rr, cc, value, True)

    positions = [6, 22]
    for r in positions:
        for c in positions:
            if matrix[r][c] is None:
                place_alignment(r, c)

    set_module(size - 8, 8, 1, True)

    for i in range(9):
        if i == 6:
            continue
        matrix[8][i] = None
        function_map[8][i] = True
        matrix[i][8] = None
        function_map[i][8] = True

    for i in range(size - 8, size):
        matrix[8][i] = None
        function_map[8][i] = True
        matrix[i][8] = None
        function_map[i][8] = True

    matrix[7][8] = 1
    matrix[8][7] = 1
    function_map[7][8] = True
    function_map[8][7] = True

    data_bits = []
    for cw in data_codewords + ec_codewords:
        for i in range(7, -1, -1):
            data_bits.append((cw >> i) & 1)

    idx = 0
    col = size - 1
    direction = -1
    while col > 0:
        if col == 6:
            col -= 1
        row = size - 1 if direction == -1 else 0
        while 0 <= row < size:
            for c in [col, col - 1]:
                if matrix[row][c] is None:
                    matrix[row][c] = data_bits[idx] if idx < len(data_bits) else 0
                    function_map[row][c] = False
                    idx += 1
            row += direction
        direction *= -1
        col -= 2

    def apply_mask(r: int, c: int, val: int):
        return val ^ ((r + c) % 2 == 0)

    for r in range(size):
        for c in range(size):
            if matrix[r][c] is not None and not function_map[r][c]:
                matrix[r][c] = apply_mask(r, c, matrix[r][c])

    format_bits = 0b01000
    value = format_bits << 10
    generator = 0b10100110111
    for i in range(14, 9, -1):
        if (value >> i) & 1:
            value ^= generator << (i - 10)
    format_value = (format_bits << 10) | value
    format_value ^= 0b101010000010010
    bits = [(format_value >> i) & 1 for i in range(14, -1, -1)]

    primary_coords = [
        (8, 0), (8, 1), (8, 2), (8, 3), (8, 4), (8, 5), (8, 7), (8, 8),
        (7, 8), (5, 8), (4, 8), (3, 8), (2, 8), (1, 8), (0, 8),
    ]
    secondary_coords = [
        (8, size - 1), (8, size - 2), (8, size - 3), (8, size - 4),
        (8, size - 5), (8, size - 6), (8, size - 7), (8, size - 8),
        (size - 7, 8), (size - 6, 8), (size - 5, 8), (size - 4, 8),
        (size - 3, 8), (size - 2, 8), (size - 1, 8),
    ]
    for (r, c), bit in zip(primary_coords, bits):
        set_module(r, c, bit, True)
    for (r, c), bit in zip(secondary_coords, bits):
        set_module(r, c, bit, True)

    return matrix

def export_svg(matrix, path: Path, scale: int = 8, padding: int = 8):
    size = len(matrix)
    canvas = scale * size + 2 * padding
    rects = []
    for r, row in enumerate(matrix):
        for c, val in enumerate(row):
            if val:
                x = padding + c * scale
                y = padding + r * scale
                rects.append(f'<rect x="{x}" y="{y}" width="{scale}" height="{scale}" fill="#000000"/>')
    svg = (
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
        f"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{canvas}\" height=\"{canvas}\" viewBox=\"0 0 {canvas} {canvas}\">\n"
        "<rect width=\"100%\" height=\"100%\" fill=\"#ffffff\"/>\n"
        + "\n".join(rects)
        + "\n</svg>\n"
    )
    path.write_text(svg, encoding="utf-8")

if __name__ == "__main__":
    data = encode_data("咨询师宁馨")
    ec = rs_remainder(data, 15)
    matrix = build_matrix(data, ec)
    export_svg(matrix, Path("img/wechat-qr.svg"))
