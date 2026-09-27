from dataclasses import dataclass
from datetime import datetime


@dataclass(slots=True)
class Company:
    id: str
    name: str
    slug: str
    created_at: datetime
    status: str = 'active'
    version: int = 1
