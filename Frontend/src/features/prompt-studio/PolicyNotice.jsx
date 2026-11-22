import { ShieldCheck, ChevronDown } from 'lucide-react'
import { isAdmin } from '../../utils/permissions'

export default function PolicyNotice({ context, policySetupRequired, optionalAdminPolicy, policyOptionalWithoutInput, currentUser }) {
  const warning = context.enforcement_ready === false || policySetupRequired
  const title = policySetupRequired ? 'Policy setup required' : context.enforcement_ready === false ? 'Policy checking needs attention' : optionalAdminPolicy ? 'Policies optional for admins' : policyOptionalWithoutInput ? 'No input policy assigned' : 'Organization policy checks'
  const description = policySetupRequired ? 'Your account needs a group with an active input policy for this integration. Set up your policy groups before sending.' : context.enforcement_ready === false ? context.readiness_reason : optionalAdminPolicy ? 'You can send messages without a policy assignment. Policies assigned to your groups still apply.' : policyOptionalWithoutInput ? 'Your organization allows messages without an input policy. Assigned output policies still apply.' : 'Every message and its conversation context pass through applicable policies. Restricted replies are withheld.'
  const groups = context.groups?.map((group) => group.name).join(', ') || 'none assigned'
  return <details className={`studio-policy-banner ${warning ? 'is-warning' : ''}`} open={warning || policyOptionalWithoutInput || undefined}>
    <summary><ShieldCheck size={16} aria-hidden="true" /><strong>{title}</strong><span className="studio-policy-group">{groups === 'none assigned' ? 'No groups assigned' : groups}</span><ChevronDown size={14} aria-hidden="true" /></summary>
    <div className="studio-policy-body" role="status"><p>{description}</p><small>Groups: {groups}</small>
      {isAdmin(currentUser) ? <a href={policySetupRequired || optionalAdminPolicy ? '#users' : '#inventory'}>{policySetupRequired ? 'Manage my groups' : optionalAdminPolicy ? 'My policy groups' : 'Manage groups'} <span aria-hidden="true">↗</span></a> : policySetupRequired && <p>Ask your administrator to assign your policy groups.</p>}
    </div>
  </details>
}
