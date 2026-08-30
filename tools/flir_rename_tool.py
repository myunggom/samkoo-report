"""
FLIR 열화상 카메라 사진 이름 변경 도구

카메라 저장 패턴:
  홀수 번호 (6589, 6591...) = 열화상 사진 → 짝수 번호 (2, 4, 6...)
  짝수 번호 (6590, 6592...) = 실제 사진   → 홀수 번호 (1, 3, 5...)

최종 결과: 실제사진(1) → 열화상(2) → 실제사진(3) → 열화상(4) ...
"""

import os
import re
import sys


def get_flir_files(folder_path):
    """폴더에서 FLIR 파일 목록을 번호 순서로 반환"""
    files = []
    for filename in os.listdir(folder_path):
        match = re.match(r'FLIR(\d+)\.jpg$', filename, re.IGNORECASE)
        if match:
            number = int(match.group(1))
            files.append((number, filename))
    files.sort(key=lambda x: x[0])
    return files


def build_rename_plan(files):
    """
    파일 목록을 받아 변경 계획을 생성.
    파일은 (홀수=열화상, 짝수=실제) 쌍으로 구성됨.
    """
    plan = []  # (원본 파일명, 최종 파일명)
    errors = []

    if len(files) % 2 != 0:
        errors.append(f"파일 개수가 홀수({len(files)}개)입니다. 쌍이 맞지 않습니다.")

    for i in range(0, len(files), 2):
        if i + 1 >= len(files):
            errors.append(f"마지막 파일 {files[i][1]}에 짝이 없습니다.")
            break

        num_a, file_a = files[i]
        num_b, file_b = files[i + 1]

        # 검증: 첫 번째가 홀수(열화상), 두 번째가 짝수(실제)
        if num_a % 2 != 1:
            errors.append(f"예상 오류: {file_a}은 홀수여야 하는데 짝수입니다.")
        if num_b % 2 != 0:
            errors.append(f"예상 오류: {file_b}은 짝수여야 하는데 홀수입니다.")

        pair_index = i // 2  # 0부터 시작
        output_real = 2 * pair_index + 1   # 홀수: 실제 사진 번호
        output_thermal = 2 * pair_index + 2  # 짝수: 열화상 사진 번호

        # file_a (열화상) → output_thermal (짝수)
        # file_b (실제)   → output_real (홀수)
        plan.append((file_a, f"{output_thermal}.jpg", "열화상"))
        plan.append((file_b, f"{output_real}.jpg", "실제"))

    return plan, errors


def preview_plan(plan):
    """변경 계획 미리보기 출력"""
    print("\n=== 이름 변경 계획 미리보기 ===")
    print(f"{'원본 파일명':<20} {'→':<3} {'최종 파일명':<15} {'종류'}")
    print("-" * 55)
    for original, final, kind in plan:
        print(f"{original:<20} {'→':<3} {final:<15} {kind}")
    print(f"\n총 {len(plan)}개 파일 변경 예정")


def execute_rename(folder_path, plan, dry_run=False):
    """실제 이름 변경 실행. dry_run=True면 미리보기만."""
    if dry_run:
        print("\n[미리보기 모드] 실제 변경은 하지 않습니다.")
        return

    # 1단계: 임시 이름으로 변경 (충돌 방지)
    print("\n1단계: 임시 이름으로 변경 중...")
    for original, final, kind in plan:
        original_path = os.path.join(folder_path, original)
        temp_path = os.path.join(folder_path, f"__TEMP__{original}")
        os.rename(original_path, temp_path)

    # 2단계: 최종 이름으로 변경
    print("2단계: 최종 이름으로 변경 중...")
    for original, final, kind in plan:
        temp_path = os.path.join(folder_path, f"__TEMP__{original}")
        final_path = os.path.join(folder_path, final)
        os.rename(temp_path, final_path)

    print(f"\n완료! {len(plan)}개 파일 이름 변경 완료.")


# 분기 폴더들이 들어있는 기본 위치
BASE_DIR = r"C:\Users\user\Desktop\Bio Innovation Hub\02 Areas\전기\[전기] 적외선 열화상분포 측정기록표\사진"


def choose_folder():
    """
    처리할 폴더를 결정한다.
    1) 명령줄로 경로를 직접 넘기면 그걸 사용.
    2) 아니면 기본 위치의 하위 폴더 목록을 보여주고 번호로 고르게 한다.
    """
    # 1) 경로를 직접 넘긴 경우
    if len(sys.argv) > 1:
        return sys.argv[1]

    # 2) 기본 위치의 하위 폴더 목록 표시
    if not os.path.isdir(BASE_DIR):
        print(f"오류: 기본 폴더를 찾을 수 없습니다.\n{BASE_DIR}")
        sys.exit(1)

    subfolders = sorted(
        name for name in os.listdir(BASE_DIR)
        if os.path.isdir(os.path.join(BASE_DIR, name))
    )

    if not subfolders:
        print(f"기본 폴더 안에 처리할 하위 폴더가 없습니다.\n{BASE_DIR}")
        sys.exit(1)

    print(f"\n기본 위치: {BASE_DIR}")
    print("\n어떤 폴더를 처리할까요?")
    for i, name in enumerate(subfolders, start=1):
        print(f"  {i}. {name}")

    choice = input("\n번호를 입력하세요: ").strip()
    if not choice.isdigit() or not (1 <= int(choice) <= len(subfolders)):
        print("올바른 번호가 아닙니다. 취소되었습니다.")
        sys.exit(1)

    return os.path.join(BASE_DIR, subfolders[int(choice) - 1])


def main():
    folder_path = choose_folder()

    if not os.path.exists(folder_path):
        print(f"오류: 폴더를 찾을 수 없습니다.\n{folder_path}")
        sys.exit(1)

    print(f"폴더: {folder_path}")
    files = get_flir_files(folder_path)
    print(f"발견된 FLIR 파일: {len(files)}개")

    if not files:
        print("FLIR 파일이 없습니다.")
        sys.exit(1)

    plan, errors = build_rename_plan(files)

    if errors:
        print("\n=== 경고 ===")
        for err in errors:
            print(f"  - {err}")
        print("\n오류가 있어 중단합니다. 위 내용을 확인해주세요.")
        sys.exit(1)

    preview_plan(plan)

    # 실행 여부 확인
    answer = input("\n위 계획대로 실행하시겠습니까? (yes 입력 시 실행): ").strip().lower()
    if answer == "yes":
        execute_rename(folder_path, plan)
    else:
        print("취소되었습니다.")


if __name__ == "__main__":
    main()
