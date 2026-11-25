from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class ImportIssue(BaseModel):
    row: int | None = None
    field: str | None = None
    code: str
    reason: str
    fix: str


class StaffImportRow(BaseModel):
    row: int
    first_name: str
    last_name: str
    email: str
    department: str
    issues: list[ImportIssue]


class StaffImportPreview(BaseModel):
    rows: list[StaffImportRow]
    file_issues: list[ImportIssue]
    ready: int
    invalid: int
    validation_proof: str | None = None


DeliveryStatus = Literal['pending', 'sent', 'failed', 'unconfirmed', 'skipped']


class StaffImportReceiptRow(BaseModel):
    row: int
    user_id: str
    first_name: str | None
    last_name: str | None
    email: str | None
    department: str | None
    delivery: DeliveryStatus


class StaffImportReceipt(BaseModel):
    id: str
    created_at: datetime
    accounts_created: int
    invitations_sent: int
    invitations_pending: int
    needs_attention: int
    rows: list[StaffImportReceiptRow]
