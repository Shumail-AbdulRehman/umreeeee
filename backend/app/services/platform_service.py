"""Restricted platform reporting; all public methods require platform authority."""

from app.core.errors import DomainError, object_id
from app.core.permissions import require_super_admin
from app.services.platform_metrics import (
    PlatformMetrics, company_metrics, company_summary, daily_series, safe_attention, window_for,
)


class PlatformService:
    def __init__(self, db, *, now=None, metrics=None):
        self.db = db
        self.now = now
        self.metrics = metrics if metrics is not None else PlatformMetrics(db)

    def overview(self, user, days=7):
        require_super_admin(user)
        start, end, window = window_for(days, self.now)
        result = self.metrics.overview(start, end)
        fields = ('total_companies', 'using_companies', 'onboarding_companies', 'suspended_companies')
        totals = next(iter(result.get('totals', [])), {})
        return {'window': window, 'generated_at': end.isoformat(),
                'metrics': {key: int(totals.get(key, 0)) for key in fields},
                'series': daily_series(result.get('series', []), start, days),
                'attention': {'items': [safe_attention(row) for row in result.get('attention_items', [])],
                              'total': next(iter(result.get('attention_total', [])), {}).get('count', 0)},
                'companies': [company_summary(row, user.company.id, start, days)
                              for row in result.get('companies', [])]}

    def companies(self, user, days=7, page=1, page_size=8, q='', access=None,
                  onboarding=None, activity=None, sort='runs'):
        require_super_admin(user)
        if (type(page) is not int or page < 1 or type(page_size) is not int
                or not 1 <= page_size <= 100 or not isinstance(q, str) or len(q) > 120
                or access not in (None, 'active', 'suspended')
                or onboarding not in (None, 'ready', 'setup_incomplete', 'awaiting_admin')
                or activity not in (None, 'used', 'idle') or sort not in ('runs', 'name', 'violations')):
            raise DomainError(422, 'invalid_filter', 'Use valid company filters and pagination')
        start, end, window = window_for(days, self.now)
        result = self.metrics.companies(start, end, page=page, page_size=page_size, q=q.strip(),
                                       access=access, onboarding=onboarding, activity=activity, sort=sort)
        return {'items': [company_summary(row, user.company.id, start, days)
                          for row in result.get('items', [])],
                'total': next(iter(result.get('total', [])), {}).get('count', 0),
                'page': page, 'page_size': page_size, 'window': window, 'generated_at': end.isoformat()}

    def company(self, user, company_id, days=7):
        require_super_admin(user)
        identifier = object_id(company_id)
        start, end, window = window_for(days, self.now)
        row = self.metrics.company(identifier, start, end)
        if not row:
            raise DomainError(404, 'not_found', 'Company not found')
        coverage = self.metrics.policy_coverage(identifier, row.get('require_active_policy', True))
        attention = [safe_attention(item) for item in row.get('attention', [])]
        if coverage['required'] and coverage['eligible_members'] > coverage['covered_members']:
            uncovered = coverage['eligible_members'] - coverage['covered_members']
            attention.append({'id': f'{identifier}:policy_coverage', 'company_id': str(identifier),
                'company_name': row['name'], 'kind': 'policy_coverage', 'title': 'Input policy coverage incomplete',
                'description': (f'Input-policy coverage is incomplete for {uncovered} active members. '
                                'Review enabled models and policy assignments.'),
                'occurred_at': None, 'tone': 'amber'})
        summary = company_summary(row, user.company.id, start, days)
        return {'company': summary, 'window': window, 'generated_at': end.isoformat(),
                'series': summary['series'], 'attention': attention,
                'metrics': company_metrics(row, coverage)}
