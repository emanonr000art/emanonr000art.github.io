# 心理咨询师个案管理系统（MVP）本地 API 说明

## 启动

```bash
npm run start:counseling
```

默认地址：`http://127.0.0.1:17776`

## 已实现能力

- 个案 CRUD（创建、列表、详情 + 实时统计）
- 预约创建与更新（支持状态切换）
- `Scheduled -> Completed` 自动生成咨询记录 Markdown 文件
- 周日历数据接口（含 weekly 重复规则展开 + exception 合并）
- ICS 输出（`/calendar.ics`）
- 全量导出 zip（db + files + manifest）

## 数据目录

- `counseling-data/db.sqlite`
- `counseling-data/files/clients/<clientId>/{sessions,supervision,assessment}`
- `counseling-data/exports/*.zip`

## 主要接口

### 1) 创建个案

`POST /api/clients`

```json
{
  "name": "个案A",
  "status": "Active",
  "tags": ["青少年", "焦虑"],
  "notes": "初访"
}
```

### 2) 创建预约

`POST /api/appointments`

```json
{
  "clientId": "<uuid>",
  "startAt": 1760007000000,
  "durationMin": 50,
  "note": "每周固定",
  "recurring": {
    "rrule": "FREQ=WEEKLY;BYDAY=WE",
    "untilAt": 1765000000000
  }
}
```

### 3) 标记完成（触发自动咨询记录）

`PATCH /api/appointments/:id`

```json
{
  "status": "Completed"
}
```

### 4) 查询周日历

`GET /api/schedule/week?weekStart=<ms>&weekEnd=<ms>`

### 5) 生成 ICS

`GET /calendar.ics`

### 6) 导出

`POST /api/export`

