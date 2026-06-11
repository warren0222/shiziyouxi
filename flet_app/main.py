# 汉字拼图游戏 - 增强版
from flet import *
import random
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont
import io
import os
import json

# 加载汉字数据
def load_hanzi_data():
    data_path = os.path.join(os.path.dirname(__file__), "..", "hanzi_data.json")
    with open(data_path, "r", encoding="utf-8") as f:
        return json.load(f)

_HAZI_DATA = load_hanzi_data()
HANZI_LIST = _HAZI_DATA["chars"]      # 全部可用汉字（按 Unicode 排序）
PINYIN_MAP = _HAZI_DATA["pinyin"]     # 拼音映射 {char: pinyin_with_tone}


class PuzzlePiece(Draggable):
    """可拖拽的拼图块"""
    def __init__(self, tile_idx, hanzi_image_part, app, size=100):
        self.tile_idx = tile_idx
        self.app = app
        self.size = size

        # 创建包含图像的容器
        self.content = Container(
            width=size,
            height=size,
            bgcolor=colors.WHITE,
            border=border.all(2, colors.BLUE_400),
            border_radius=8,
            alignment=alignment.center,
            content=Image(
                src_base64=self.image_to_base64(hanzi_image_part),
                width=size-4,
                height=size-4,
                fit=ImageFit.FILL
            )
        )

        # 创建拖拽反馈
        self.content_drag_feedback = Container(
            width=size,
            height=size,
            bgcolor=colors.AMBER_200,
            border=border.all(2, colors.BLUE_400),
            border_radius=8
        )

        super().__init__(
            content=self.content,
            content_when_dragging=self.content_drag_feedback
        )


class DropTarget(DragTarget):
    """可放置区域"""
    def __init__(self, position_idx, app, size=100):
        self.position_idx = position_idx
        self.app = app
        self.size = size

        self.content = Container(
            width=size,
            height=size,
            bgcolor=colors.GREY_200,
            border=border.all(2, colors.BLUE_200),
            border_radius=8,
            alignment=alignment.center,
            content=Text(
                f"{position_idx + 1}",
                size=24,
                color=colors.GREY_400
            )
        )

        super().__init__(
            group="puzzle",
            content=self.content,
            on_accept=self.on_accept,
            on_will_accept=self.on_will_accept,
            on_leave=self.on_leave
        )

    def on_will_accept(self, e):
        self.content.border = border.all(3, colors.GREEN_500)
        self.content.update()
        return True

    def on_leave(self, e):
        self.content.border = border.all(2, colors.BLUE_200)
        self.content.update()

    def on_accept(self, e):
        """处理放置事件 - 交换拼图块"""
        dragged_piece = e.data

        # 找到被拖拽块的位置
        dragged_pos = None
        for i, piece in enumerate(self.app.pieces):
            if piece and piece.tile_idx == dragged_piece.tile_idx:
                dragged_pos = i
                break

        if dragged_pos is not None and dragged_pos != self.position_idx:
            # 交换位置
            self.app.pieces[dragged_pos], self.app.pieces[self.position_idx] = (
                self.app.pieces[self.position_idx],
                self.app.pieces[dragged_pos]
            )
            self.app.moves += 1
            self.app.move_label.value = f"步数: {self.app.moves}"
            self.app.move_label.update()
            self.app.render_puzzle()
            self.app.check_win()


class HanziPuzzleApp:
    def __init__(self, page):
        self.page = page
        self.current_hanzi = ""
        self.grid_size = 3  # 3x3
        self.pieces = []    # 当前拼图块状态（存储 PuzzlePiece 对象）
        self.correct_order = []  # 正确顺序
        self.moves = 0      # 步数
        self.start_time = None
        self.timer_running = False
        self.selected_tile = None
        self.hint_active = False

        # 确保字体目录存在
        self.font_dir = "assets/fonts"
        self.setup_fonts()

        self.page.title = "汉字拼图游戏"
        self.page.vertical_alignment = MainAxisAlignment.CENTER
        self.page.horizontal_alignment = CrossAxisAlignment.CENTER
        self.page.theme_mode = ThemeMode.LIGHT

        # 目标汉字 + 拼音显示
        self.target_hanzi_text = Text(
            "",
            size=80,
            color=colors.BLUE_800,
            weight=FontWeight.BOLD
        )
        self.target_pinyin_text = Text(
            "",
            size=22,
            color=colors.GREY_600,
            weight=FontWeight.NORMAL
        )
        self.target_display = Container(
            width=150,
            height=150,
            bgcolor=colors.BLUE_100,
            border_radius=15,
            alignment=alignment.center,
            content=Column(
                [self.target_hanzi_text, self.target_pinyin_text],
                horizontal_alignment=CrossAxisAlignment.CENTER,
                spacing=0,
            ),
        )

        # 拼图区域
        self.puzzle_grid = GridView(
            runs_count=3,
            max_extent=100,
            spacing=5,
            run_spacing=5,
            height=330,
            width=330
        )

        # 信息标签
        self.move_label = Text("步数: 0", size=16, color=colors.GREY_700)
        self.time_label = Text("时间: 0s", size=16, color=colors.GREY_700)

        # 难度选择
        self.difficulty_dropdown = Dropdown(
            width=120,
            options=[
                dropdown.Option("2", "简单 (2x2)"),
                dropdown.Option("3", "普通 (3x3)"),
                dropdown.Option("4", "困难 (4x4)"),
                dropdown.Option("5", "专家 (5x5)"),
            ],
            value="3",
            on_change=self.change_difficulty
        )

        # 主容器
        self.main_container = Column(
            [
                # 标题
                Text(
                    "汉字拼图",
                    size=40,
                    weight=FontWeight.BOLD,
                    color=colors.BLUE_800
                ),
                Divider(height=20, color=colors.TRANSPARENT),

                # 难度选择
                Row(
                    [Text("难度：", size=16), self.difficulty_dropdown],
                    alignment=MainAxisAlignment.CENTER
                ),
                Divider(height=10, color=colors.TRANSPARENT),

                # 目标汉字显示
                Container(
                    content=Text("目标汉字", size=16, color=colors.GREY_600),
                    margin=margin.only(bottom=10)
                ),
                self.target_display,

                Divider(height=30, color=colors.TRANSPARENT),
                self.puzzle_grid,
                Divider(height=20, color=colors.TRANSPARENT),

                # 信息栏
                Row(
                    [self.move_label, Container(width=30), self.time_label],
                    alignment=MainAxisAlignment.CENTER
                ),

                Divider(height=20, color=colors.TRANSPARENT),

                # 按钮区域
                Row(
                    [
                        ElevatedButton(
                            "新游戏",
                            icon=icons.REFRESH,
                            bgcolor=colors.BLUE_500,
                            color=colors.WHITE,
                            style=ButtonStyle(
                                shape=RoundedRectangleBorder(radius=10),
                                padding=padding.symmetric(20, 30)
                            ),
                            on_click=self.new_game
                        ),
                        Container(width=20),
                        ElevatedButton(
                            "提示",
                            icon=icons.VISIBILITY,
                            bgcolor=colors.AMBER_500,
                            color=colors.WHITE,
                            style=ButtonStyle(
                                shape=RoundedRectangleBorder(radius=10),
                                padding=padding.symmetric(20, 30)
                            ),
                            on_click=self.show_hint
                        )
                    ],
                    alignment=MainAxisAlignment.CENTER
                )
            ],
            alignment=MainAxisAlignment.CENTER,
            horizontal_alignment=CrossAxisAlignment.CENTER
        )

    def setup_fonts(self):
        """设置字体"""
        os.makedirs(self.font_dir, exist_ok=True)

    def generate_hanzi_image(self, hanzi, size=300):
        """生成汉字图像"""
        # 创建图像
        img = Image.new('RGB', (size, size), color='white')
        draw = ImageDraw.Draw(img)

        # 尝试使用中文字体
        try:
            # 常见的中文字体路径
            font_paths = [
                '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
                '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
                '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
                '/System/Library/Fonts/PingFang.ttc',
                'C:\\Windows\\Fonts\\msyh.ttc',
                'C:\\Windows\\Fonts\\simsun.ttc',
            ]

            font_size = size * 0.8
            font = None
            for font_path in font_paths:
                try:
                    font = ImageFont.truetype(font_path, font_size)
                    break
                except:
                    continue

            if font:
                # 绘制汉字
                bbox = draw.textbbox((0, 0), hanzi, font=font)
                text_width = bbox[2] - bbox[0]
                text_height = bbox[3] - bbox[1]
                x = (size - text_width) // 2
                y = (size - text_height) // 2 - bbox[1]
                draw.text((x, y), hanzi, fill='#1976D2', font=font)
            else:
                # 如果没有字体，使用默认
                draw.text((size//4, size//4), hanzi, fill='#1976D2')
        except Exception as e:
            # 降级方案：只画背景和边框
            draw.rectangle([10, 10, size-10, size-10], outline='#1976D2', width=3)

        return img

    def split_hanzi_image(self, img, grid_size=3):
        """将汉字图像切分成网格"""
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

        return tiles

    def image_to_base64(self, img):
        """将 PIL 图像转换为 base64"""
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        img_str = buffer.getvalue()
        import base64
        return base64.b64encode(img_str).decode()

    def new_game(self, e):
        """开始新游戏"""
        # 随机选择汉字
        self.current_hanzi = random.choice(HANZI_LIST)
        # 更新目标汉字和拼音显示
        self.target_hanzi_text.value = self.current_hanzi
        self.target_pinyin_text.value = PINYIN_MAP.get(self.current_hanzi, "")
        self.target_hanzi_text.update()
        self.target_pinyin_text.update()

        # 生成汉字图像并切分
        grid_size = int(self.difficulty_dropdown.value)
        hanzi_img = self.generate_hanzi_image(self.current_hanzi)
        hanzi_tiles = self.split_hanzi_image(hanzi_img, grid_size)

        # 创建正确的顺序
        tile_count = grid_size * grid_size
        self.correct_order = list(range(tile_count))
        self.pieces = [None] * tile_count

        # 先放置正确顺序
        for i in range(tile_count):
            piece = PuzzlePiece(i, hanzi_tiles[i], self, size=100)
            self.pieces[i] = piece

        # 打乱顺序
        order = self.correct_order.copy()
        random.shuffle(order)

        # 应用打乱后的顺序
        self.pieces = [self.pieces[order[i]] for i in range(tile_count)]

        # 重置状态
        self.moves = 0
        self.start_time = datetime.now()
        self.timer_running = True
        self.move_label.value = "步数: 0"
        self.time_label.value = "时间: 0s"

        # 渲染拼图网格
        self.render_puzzle()

        # 启动计时器
        self.start_timer()

        self.move_label.update()
        self.time_label.update()

    def change_difficulty(self, e):
        """更改难度"""
        self.new_game(None)

    def render_puzzle(self):
        """渲染拼图网格"""
        self.puzzle_grid.controls.clear()
        grid_size = int(self.difficulty_dropdown.value)

        for i, piece in enumerate(self.pieces):
            if piece:
                self.puzzle_grid.controls.append(piece)
            else:
                # 空位
                self.puzzle_grid.controls.append(
                    Container(
                        width=100,
                        height=100,
                        bgcolor=colors.GREY_200,
                        border_radius=8
                    )
                )

        self.puzzle_grid.runs_count = grid_size
        self.puzzle_grid.update()

    def check_win(self):
        """检查是否完成拼图"""
        current_order = [piece.tile_idx for piece in self.pieces]
        if current_order == self.correct_order:
            self.timer_running = False
            elapsed = int((datetime.now() - self.start_time).total_seconds())

            # 显示胜利对话框
            self.page.dialog = AlertDialog(
                modal=True,
                title=Text("恭喜！", size=24, weight=FontWeight.BOLD),
                content=Column(
                    [
                        Text("拼图完成！", size=18),
                        Container(height=10),
                        Text(f"汉字：{self.current_hanzi}", size=16),
                        Text(f"拼音：{PINYIN_MAP.get(self.current_hanzi, '')}", size=16),
                        Text(f"用时：{elapsed}秒", size=16),
                        Text(f"步数：{self.moves}", size=16),
                    ],
                    horizontal_alignment=CrossAxisAlignment.CENTER
                ),
                actions=[
                    TextButton(
                        "再来一局",
                        style=ButtonStyle(bgcolor=colors.BLUE_500, color=colors.WHITE),
                        on_click=lambda e: self.close_dialog_and_new_game(e)
                    ),
                    TextButton("关闭", on_click=lambda e: self.close_dialog(e))
                ],
                actions_alignment=MainAxisAlignment.CENTER
            )
            self.page.dialog.open = True
            self.page.update()

    def close_dialog(self, e):
        self.page.dialog.open = False
        self.page.update()

    def close_dialog_and_new_game(self, e):
        self.page.dialog.open = False
        self.page.update()
        self.new_game(None)

    def show_hint(self, e):
        """显示提示 - 醒目高亮正确/错误位置，2秒后自动恢复"""
        self.hint_active = True
        for i, piece in enumerate(self.pieces):
            if piece.tile_idx == i:
                # 位置正确 - 粗绿色边框 + 绿色背景
                piece.content.border = border.all(4, colors.GREEN_600)
                piece.content.bgcolor = colors.GREEN_100
            else:
                # 位置错误 - 红色虚线边框 + 浅红背景
                piece.content.border = border.only(
                    left=border.BorderSide(4, colors.RED_500, BorderSideStyle.DASHED),
                    right=border.BorderSide(4, colors.RED_500, BorderSideStyle.DASHED),
                    top=border.BorderSide(4, colors.RED_500, BorderSideStyle.DASHED),
                    bottom=border.BorderSide(4, colors.RED_500, BorderSideStyle.DASHED),
                )
                piece.content.bgcolor = colors.RED_50
        self.puzzle_grid.update()

        # 2秒后自动恢复
        import asyncio
        async def restore():
            await asyncio.sleep(2)
            if self.hint_active:
                self.hint_active = False
                for i, piece in enumerate(self.pieces):
                    piece.content.border = border.all(2, colors.BLUE_400)
                    piece.content.bgcolor = colors.WHITE
                self.puzzle_grid.update()
        self.page.run_task(restore)

    def start_timer(self):
        """启动计时器"""
        self.timer_running = True
        self.update_timer()

    def update_timer(self):
        """更新计时器显示"""
        if self.timer_running and self.start_time:
            elapsed = int((datetime.now() - self.start_time).total_seconds())
            self.time_label.value = f"时间: {elapsed}s"
            self.time_label.update()
            # 继续更新
            self.page.run_task(self.update_timer, 1000)


def main(page: Page):
    app = HanziPuzzleApp(page)
    page.add(app.main_container)
    # 自动开始第一局
    app.new_game(None)


if __name__ == "__main__":
    app(target=main, view=AppView.WEB_BROWSER)