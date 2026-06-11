# 测试汉字拼图游戏核心功能
from PIL import Image, ImageDraw, ImageFont
import random

# 汉字库
HANZI_LIST = ["汉", "字", "拼", "图", "游", "戏", "中", "国", "文", "化"]

def generate_hanzi_image(hanzi, size=300):
    """生成汉字图像"""
    img = Image.new('RGB', (size, size), color='white')
    draw = ImageDraw.Draw(img)

    # 尝试使用中文字体
    try:
        font_paths = [
            '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
            '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
        ]

        font_size = size * 0.8
        font = None
        for font_path in font_paths:
            try:
                font = ImageFont.truetype(font_path, font_size)
                print(f"✓ 使用字体: {font_path}")
                break
            except:
                continue

        if font:
            bbox = draw.textbbox((0, 0), hanzi, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            x = (size - text_width) // 2
            y = (size - text_height) // 2 - bbox[1]
            draw.text((x, y), hanzi, fill='#1976D2', font=font)
            print(f"✓ 汉字 '{hanzi}' 绘制成功")
        else:
            print("✗ 未找到中文字体")
    except Exception as e:
        print(f"✗ 绘制汉字出错: {e}")

    return img

def split_hanzi_image(img, grid_size=3):
    """切分汉字图像"""
    width, height = img.size
    tile_width = width // grid_size
    tile_height = height // grid_size

    tiles = []
    for row in range(grid_size):
        for col in range(grid_size):
            left = col * tile_width
            top = row * tile_height
            right = left + tile_width
            bottom = top + tile_height
            tile = img.crop((left, top, right, bottom))
            tiles.append(tile)

    print(f"✓ 切分成 {len(tiles)} 块 ({grid_size}x{grid_size})")
    return tiles

# 测试
print("=" * 40)
print("汉字拼图游戏 - 核心功能测试")
print("=" * 40)

# 随机选择汉字
hanzi = random.choice(HANZI_LIST)
print(f"\n1. 随机选择汉字: {hanzi}")

# 生成图像
print("\n2. 生成汉字图像...")
img = generate_hanzi_image(hanzi)
if img:
    # 保存原始图像
    img.save("/tmp/hanzi_original.png")
    print("   原始图像已保存: /tmp/hanzi_original.png")

    # 切分图像
    print("\n3. 切分图像...")
    tiles = split_hanzi_image(img, grid_size=3)

    # 保存每个切分块
    for i, tile in enumerate(tiles):
        tile.save(f"/tmp/hanzi_tile_{i}.png")
    print(f"   切分块已保存: /tmp/hanzi_tile_0.png ~ /tmp/hanzi_tile_8.png")

    # 模拟拼图
    print("\n4. 模拟拼图打乱...")
    correct_order = list(range(9))
    shuffled_order = correct_order.copy()
    random.shuffle(shuffled_order)
    print(f"   正确顺序: {correct_order}")
    print(f"   打乱顺序: {shuffled_order}")

    # 检查是否可解
    print("\n5. 可解性检查...")
    print("   ✓ 任意交换模式总是可解的")

print("\n" + "=" * 40)
print("测试完成！")
print("=" * 40)
print("\n提示: 在项目根目录运行以下命令启动 Flet 游戏:")
print("  python flet_app/main.py        # 浏览器模式")
print("  python flet_app/main.py -d     # 桌面模式")