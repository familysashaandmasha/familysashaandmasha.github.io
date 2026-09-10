#!/usr/bin/env python3
"""
Из списка гостей делает guests.json и таблицу персональных ссылок.

Входной файл — по гостю на строку:

    обращение; число мест; имена через запятую

    Анна и Петр; 2; Анна, Петр
    Елена Юрьевна; 1
    Семья Кузнецовых; 4; Ольга, Игорь, Соня, Тимур
    Егор

Число мест можно не писать — тогда 1. Отдельные имена нужны только
для тех, кого зовут больше одного: если придут не все, анкета спросит,
кто именно, и подставит эти имена кнопками.

    python make_links.py guests.txt --base https://mariia-and-name.ru

Пишет рядом guests.json (кладется в корень сайта) и links.csv
(оттуда копируете ссылку каждому гостю в мессенджер).
"""

import argparse, csv, json, pathlib, secrets, string

ALPHABET = string.ascii_lowercase + string.digits


def token(existing):
    while True:
        t = "".join(secrets.choice(ALPHABET) for _ in range(6))
        if t not in existing:
            return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--base", required=True, help="адрес сайта без слэша в конце")
    ap.add_argument("--json", default="guests.json")
    ap.add_argument("--csv", default="links.csv")
    args = ap.parse_args()

    out = pathlib.Path(args.json)
    # Уже выданные ссылки не переприсваиваем — иначе они сломаются у гостей
    existing = json.loads(out.read_text(encoding="utf-8")) if out.exists() else {}
    by_name = {v["name"]: k for k, v in existing.items()}

    rows = []
    for line in pathlib.Path(args.input).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [x.strip() for x in line.split(";")]
        name = parts[0]
        seats = int(parts[1]) if len(parts) > 1 and parts[1] else 1
        people = [x.strip() for x in parts[2].split(",") if x.strip()] if len(parts) > 2 else []

        if people and len(people) != seats:
            print(f"  внимание: «{name}» — мест {seats}, а имен {len(people)}")

        t = by_name.get(name) or token(existing)
        rec = {"name": name, "seats": seats}
        if people:
            rec["people"] = people
        existing[t] = rec
        rows.append((name, seats, f"{args.base}/?g={t}"))

    out.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    with open(args.csv, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Гость", "Мест", "Ссылка", "Отправлено", "Ответ"])
        for r in rows:
            w.writerow([*r, "", ""])

    print(f"{len(rows)} гостей → {args.json}, {args.csv}")


if __name__ == "__main__":
    main()
