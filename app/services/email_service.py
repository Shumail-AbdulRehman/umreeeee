import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage

from app.core.config import (
    FRONTEND_APP_URL,
    INVITATION_EXPIRE_HOURS,
    SMTP_ENABLED,
    SMTP_FROM_EMAIL,
    SMTP_FROM_NAME,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USE_SSL,
    SMTP_USE_TLS,
    SMTP_USERNAME,
)


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EmailDeliveryResult:
    delivered: bool
    mode: str


def verification_message(verification_code: str) -> str:
    return '\n'.join(
        [
            'Your Sentinel AI verification code is below.',
            '',
            f'Code: {verification_code}',
            '',
            'This code expires in 10 minutes.',
            'If you did not request this account, you can ignore this email.',
        ]
    )


def password_reset_message(verification_code: str) -> str:
    return '\n'.join(
        [
            'Your Sentinel AI password reset code is below.',
            '',
            f'Code: {verification_code}',
            '',
            'This code expires in 10 minutes.',
            'If you did not request a password reset, you can ignore this email.',
        ]
    )


def invitation_message(invitation_link: str, company_name: str) -> str:
    return '\n'.join(
        [
            f'You have been invited to join {company_name} on Sentinel AI.',
            '',
            'Open the link below to set your password and activate your account:',
            invitation_link,
            '',
            f'This invitation link expires in {INVITATION_EXPIRE_HOURS} hours.',
            'If you were not expecting this invitation, you can ignore this email.',
        ]
    )


def send_email_with_code(
    recipient_email: str,
    *,
    subject: str,
    text_message: str,
) -> EmailDeliveryResult:
    if not SMTP_ENABLED:
        logger.warning('SMTP delivery unavailable; configure a local SMTP sink for development')
        return EmailDeliveryResult(delivered=False, mode='unavailable')

    return send_email_via_smtp(
        recipient_email,
        subject=subject,
        text_message=text_message,
    )


def send_email_via_smtp(
    recipient_email: str,
    *,
    subject: str,
    text_message: str,
) -> EmailDeliveryResult:
    message = EmailMessage()
    message['Subject'] = subject
    message['From'] = f'{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>'
    message['To'] = recipient_email
    message.set_content(text_message)

    smtp_class = smtplib.SMTP_SSL if SMTP_USE_SSL else smtplib.SMTP
    try:
        with smtp_class(SMTP_HOST, SMTP_PORT, timeout=20) as server:
            if SMTP_USE_TLS and not SMTP_USE_SSL:
                server.ehlo()
                server.starttls()
                server.ehlo()
            if SMTP_USERNAME:
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(message)
        logger.info('Email delivered via SMTP to %s', recipient_email)
        return EmailDeliveryResult(delivered=True, mode='smtp')
    except (OSError, smtplib.SMTPException) as exc:
        logger.warning(
            'SMTP delivery failed (%s)',
            type(exc).__name__,
        )
        return EmailDeliveryResult(delivered=False, mode='unavailable')


def send_verification_email(recipient_email: str, verification_code: str) -> EmailDeliveryResult:
    return send_email_with_code(
        recipient_email,
        subject='Verify your Sentinel AI account',
        text_message=verification_message(verification_code),
    )


def send_password_reset_email(recipient_email: str, verification_code: str) -> EmailDeliveryResult:
    return send_email_with_code(
        recipient_email,
        subject='Reset your Sentinel AI password',
        text_message=password_reset_message(verification_code),
    )


def build_invitation_link(token: str) -> str:
    return f'{FRONTEND_APP_URL}/#accept-invite?token={token}'


def send_invitation_email(recipient_email: str, token: str, company_name: str) -> EmailDeliveryResult:
    invitation_link = build_invitation_link(token)
    return send_email_with_code(
        recipient_email,
        subject=f'You have been invited to {company_name} on Sentinel AI',
        text_message=invitation_message(invitation_link, company_name),
    )
