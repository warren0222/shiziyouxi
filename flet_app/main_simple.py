# 汉字拼图游戏 - 简化版（无需图像处理）
from flet import *
import random
from datetime import datetime
import json
import os

# 加载汉字数据
def load_hanzi_data():
    data_path = os.path.join(os.path.dirname(__file__), "..", "hanzi_data.json")
    with open(data_path, "r", encoding="utf-8") as f:
        return json.load(f)

_HANZI_DATA = load_hanzi_data()
HANZI_LIST = _HANZI_DATA["chars"]      # 3500 常用汉字
PINYIN_MAP = _HANZI_DATA["pinyin"]     # 拼音映射


class HanziPuzzleApp:
    def __init__(self, page):
        self.page = page
        self.current_hanzi = ""
        self.grid_size = 3
        self.tiles = []
        self.correct_order = []
        self.moves = 0
        self.start_time = None
        self.timer_running = False
        self.selected_idx = None
        self.hint_active = False

        self.page.title = "汉字拼图游戏"
        self.page.vertical_alignment = MainAxisAlignment.CENTER
        self.page.horizontal_alignment = CrossAxisAlignment.CENTER
        self.page.theme_mode = ThemeMode.LIGHT
        self.page.bgcolor = colors.LIGHT_BLUE_50

        # 目标汉字显示
        self.target_display = Container(
            width=180,
            height=180,
            bgcolor=colors.BLUE_100,
            border_radius=20,
            border=border.all(3, colors.BLUE_400),
            alignment=alignment.center,
            content=Text(
                "",
                size=100,
                color=colors.BLUE_700,
                weight=FontWeight.BOLD
            )
        )

        # 拼图网格
        self.puzzle_grid = GridView(
            runs_count=3,
            max_extent=110,
            spacing=8,
            run_spacing=8,
            height=360,
            width=360
        )

        # 信息标签
        self.move_label = Text("步数: 0", size=20, color=colors.GREY_800, weight=FontWeight.BOLD)
        self.time_label = Text("时间: 0s", size=20, color=colors.GREY_800, weight=FontWeight.BOLD)

        # 难度选择
        self.difficulty_dropdown = Dropdown(
            width=150,
            options=[
                dropdown.Option("2", "简单 2x2"),
                dropdown.Option("3", "普通 3x3"),
                dropdown.Option("4", "困难 4x4"),
            ],
            value="3",
            on_change=self.change_difficulty
        )

        # 主界面
        self.main_container = Column(
            [
                Container(
                    content=Text(
                        "汉字拼图",
                        size=48,
                        weight=FontWeight.BOLD,
                        color=colors.BLUE_800
                    ),
                    margin=margin.only(bottom=20)
                ),

                # 难度和新游戏按钮
                Row(
                    [
                        Text("难度：", size=18, color=colors.GREY_700),
                        self.difficulty_dropdown,
                        Container(width=20),
                        ElevatedButton(
                            "新游戏",
                            icon=icons.REFRESH,
                            bgcolor=colors.BLUE_500,
                            color=colors.WHITE,
                            style=ButtonStyle(
                                shape=RoundedRectangleBorder(radius=12),
                                padding=padding.symmetric(15, 25)
                            ),
                            on_click=self.new_game
                        )
                    ],
                    alignment=MainAxisAlignment.CENTER
                ),

                Divider(height=20, color=colors.TRANSPARENT),

                # 目标汉字
                Container(
                    content=Text("目标汉字", size=18, color=colors.GREY_600),
                    margin=margin.only(bottom=10)
                ),
                self.target_display,

                Divider(height=25, color=colors.TRANSPARENT),

                # 拼图区域
                self.puzzle_grid,

                Divider(height=20, color=colors.TRANSPARENT),

                # 信息栏
                Row(
                    [
                        self.move_label,
                        Container(width=40),
                        self.time_label
                    ],
                    alignment=MainAxisAlignment.CENTER
                ),

                Divider(height=15, color=colors.TRANSPARENT),

                # 提示按钮
                ElevatedButton(
                    "提示",
                    icon=icons.VISIBILITY,
                    bgcolor=colors.AMBER_500,
                    color=colors.WHITE,
                    style=ButtonStyle(
                        shape=RoundedRectangleBorder(radius=12),
                        padding=padding.symmetric(15, 30)
                    ),
                    on_click=self.show_hint
                )
            ],
            alignment=MainAxisAlignment.CENTER,
            horizontal_alignment=CrossAxisAlignment.CENTER
        )

    def new_game(self, e):
        """开始新游戏"""
        self.current_hanzi = random.choice(HANZI_LIST)
        self.target_display.content.value = self.current_hanzi
        self.target_display.update()

        grid_size = int(self.difficulty_dropdown.value)
        tile_count = grid_size * grid_size

        self.correct_order = list(range(tile_count))
        self.tiles = self.correct_order.copy()

        # 确保打乱
        while self.tiles == self.correct_order:
            random.shuffle(self.tiles)

        self.moves = 0
        self.start_time = datetime.now()
        self.timer_running = True
        self.selected_idx = None

        self.move_label.value = "步数: 0"
        self.time_label.value = "时间: 0s"

        self.render_puzzle()
        self.start_timer()
        self.move_label.update()
        self.time_label.update()

    def change_difficulty(self, e):
        """更改难度"""
        self.new_game(None)

    def render_puzzle(self):
        """渲染拼图"""
        self.puzzle_grid.controls.clear()
        grid_size = int(self.difficulty_dropdown.value)

        # 根据位置给每个块不同的颜色深度，模拟汉字的部分
        colors_list = [
            colors.BLUE_50, colors.BLUE_100, colors.BLUE_200,
            colors.BLUE_100, colors.BLUE_200, colors.BLUE_300,
            colors.BLUE_200, colors.BLUE_300, colors.BLUE_400,
            colors.BLUE_300, colors.BLUE_400, colors.BLUE_500,
            colors.BLUE_400, colors.BLUE_500, colors.BLUE_600,
            colors.BLUE_500, colors.BLUE_600, colors.BLUE_700,
            colors.BLUE_600, colors.BLUE_700, colors.BLUE_800,
            colors.BLUE_700, colors.BLUE_800, colors.BLUE_900,
        ]

        for i, tile_idx in enumerate(self.tiles):
            # 计算原始位置
            orig_row = tile_idx // grid_size
            orig_col = tile_idx % grid_size

            # 创建拼图块
            tile = Container(
                width=100,
                height=100,
                bgcolor=colors_list[tile_idx % len(colors_list)],
                border=border.all(3, colors.BLUE_500),
                border_radius=12,
                alignment=alignment.center,
                content=Column(
                    [
                        Text(
                            f"#{tile_idx + 1}",
                            size=24,
                            color=colors.BLUE_700,
                            weight=FontWeight.BOLD
                        ),
                        Text(
                            f"({orig_row + 1},{orig_col + 1})",
                            size=14,
                            color=colors.BLUE_600
                        )
                    ],
                    alignment=MainAxisAlignment.CENTER,
                    horizontal_alignment=CrossAxisAlignment.CENTER
                ),
                on_click=lambda e, idx=i: self.on_tile_click(idx)
            )

            self.puzzle_grid.controls.append(tile)

        self.puzzle_grid.runs_count = grid_size
        self.puzzle_grid.update()

    def on_tile_click(self, clicked_idx):
        """处理点击"""
        if not self.timer_running:
            return

        if self.selected_idx is None:
            # 第一次点击 - 选中
            self.selected_idx = clicked_idx
            self.puzzle_grid.controls[clicked_idx].bgcolor = colors.AMBER_200
            self.puzzle_grid.controls[clicked_idx].border = border.all(4, colors.AMBER_600)
            self.puzzle_grid.update()
        else:
            # 第二次点击 - 交换
            if self.selected_idx != clicked_idx:
                self.tiles[self.selected_idx], self.tiles[clicked_idx] = (
                    self.tiles[clicked_idx],
                    self.tiles[self.selected_idx]
                )
                self.moves += 1
                self.move_label.value = f"步数: {self.moves}"
                self.move_label.update()
                self.render_puzzle()
                self.check_win()

            self.selected_idx = None

    def check_win(self):
        """检查胜利"""
        if self.tiles == self.correct_order:
            self.timer_running = False
            elapsed = int((datetime.now() - self.start_time).total_seconds())

            self.page.dialog = AlertDialog(
                modal=True,
                title=Row(
                    [
                        Icon(icons.EMOJI_EVENTS, size=40, color=colors.AMBER_500),
                        Text("恭喜！", size=28, weight=FontWeight.BOLD, color=colors.GREEN_700)
                    ],
                    spacing=10
                ),
                content=Column(
                    [
                        Text("拼图完成！🎉", size=20, color=colors.GREEN_600),
                        Divider(height=15),
                        Text(f"汉字：{self.current_hanzi}", size=18),
                        Text(f"用时：{elapsed}秒", size=18),
                        Text(f"步数：{self.moves}", size=18),
                    ],
                    horizontal_alignment=CrossAxisAlignment.CENTER
                ),
                actions=[
                    ElevatedButton(
                        "再来一局",
                        icon=icons.REFRESH,
                        bgcolor=colors.BLUE_500,
                        color=colors.WHITE,
                        on_click=lambda e: self.close_and_new_game(e)
                    ),
                    ElevatedButton(
                        "关闭",
                        on_click=lambda e: self.close_dialog(e)
                    )
                ],
                actions_alignment=MainAxisAlignment.CENTER
            )
            self.page.dialog.open = True
            self.page.update()

    def close_dialog(self, e):
        self.page.dialog.open = False
        self.page.update()

    def close_and_new_game(self, e):
        self.page.dialog.open = False
        self.page.update()
        self.new_game(None)

    def show_hint(self, e):
        """显示提示 - 醒目高亮，2秒后自动恢复"""
        self.hint_active = True
        colors_list = [
            colors.BLUE_50, colors.BLUE_100, colors.BLUE_200,
            colors.BLUE_100, colors.BLUE_200, colors.BLUE_300,
            colors.BLUE_200, colors.BLUE_300, colors.BLUE_400,
            colors.BLUE_300, colors.BLUE_400, colors.BLUE_500,
            colors.BLUE_400, colors.BLUE_500, colors.BLUE_600,
            colors.BLUE_500, colors.BLUE_600, colors.BLUE_700,
            colors.BLUE_600, colors.BLUE_700, colors.BLUE_800,
            colors.BLUE_700, colors.BLUE_800, colors.BLUE_900,
        ]

        for i, tile_idx in enumerate(self.tiles):
            if tile_idx == i:
                # 位置正确 - 粗绿边框 + 绿色背景
                self.puzzle_grid.controls[i].bgcolor = colors.GREEN_200
                self.puzzle_grid.controls[i].border = border.all(5, colors.GREEN_600)
                self.puzzle_grid.controls[i].content = Column(
                    [Icon(icons.CHECK_CIRCLE, size=40, color=colors.GREEN_600)],
                    alignment=MainAxisAlignment.CENTER,
                    horizontal_alignment=CrossAxisAlignment.CENTER
                )
            else:
                # 位置错误 - 红色虚线边框 + 浅红背景
                self.puzzle_grid.controls[i].bgcolor = colors.RED_50
                self.puzzle_grid.controls[i].border = border.only(
                    left=border.BorderSide(5, colors.RED_500, BorderSideStyle.DASHED),
                    right=border.BorderSide(5, colors.RED_500, BorderSideStyle.DASHED),
                    top=border.BorderSide(5, colors.RED_500, BorderSideStyle.DASHED),
                    bottom=border.BorderSide(5, colors.RED_500, BorderSideStyle.DASHED),
                )
                self.puzzle_grid.controls[i].content = Column(
                    [Icon(icons.CANCEL, size=40, color=colors.RED_400)],
                    alignment=MainAxisAlignment.CENTER,
                    horizontal_alignment=CrossAxisAlignment.CENTER
                )

        self.puzzle_grid.update()

        # 2秒后自动恢复原貌
        import asyncio
        async def restore():
            await asyncio.sleep(2)
            if self.hint_active:
                self.hint_active = False
                for i, tile_idx in enumerate(self.tiles):
                    orig_row = tile_idx // int(self.difficulty_dropdown.value)
                    orig_col = tile_idx % int(self.difficulty_dropdown.value)
                    self.puzzle_grid.controls[i].bgcolor = colors_list[tile_idx % len(colors_list)]
                    self.puzzle_grid.controls[i].border = border.all(3, colors.BLUE_500)
                    self.puzzle_grid.controls[i].content = Column(
                        [
                            Text(f"#{tile_idx + 1}", size=24, color=colors.BLUE_700, weight=FontWeight.BOLD),
                            Text(f"({orig_row + 1},{orig_col + 1})", size=14, color=colors.BLUE_600)
                        ],
                        alignment=MainAxisAlignment.CENTER,
                        horizontal_alignment=CrossAxisAlignment.CENTER
                    )
                self.puzzle_grid.update()
        self.page.run_task(restore)


def main(page: Page):
    app = HanziPuzzleApp(page)
    page.add(app.main_container)
    app.new_game(None)


if __name__ == "__main__":
    app(target=main)