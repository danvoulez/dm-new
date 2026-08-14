"""Human-facing message catalog for every runtime doubt reason.

The runtime's failure vocabulary is closed: :data:`lab.runtime.DOUBT_REASONS` is
exhaustive and pinned by a test. That is what makes a real message catalog possible —
every way work can fail to move has a hand-written sentence and one action, so an
interface never has to fall back on "an error occurred".

Two audiences hide inside those codes, and conflating them is cruel: some are things
the person who filed the request can fix, and some are configuration only an operator
can touch. ``resolved_by`` says which, so an interface can ask in one case and explain
in the other.

Text is pt-BR because that is this deployment's interface language. Placeholders in
``{braces}`` are filled from the doubt receipt by :func:`render`.
"""
from __future__ import annotations

from typing import Any

USER = "user"
OPERATOR = "operator"

# reason -> (message template, action label, who can resolve it)
CATALOG: dict[str, tuple[str, str, str]] = {
    # -- contract and activation ------------------------------------------------
    "unknown_process": (
        "Ficou registrado, mas o tipo de processo solicitado não existe no catálogo atual.",
        "Escolher tipo", USER,
    ),
    "process_route_mismatch": (
        "O processo endereçado pela rota não é o mesmo declarado no registro. Nada foi executado.",
        "Ver integração", OPERATOR,
    ),
    "process_not_active": (
        "Este tipo de solicitação está desativado no momento.",
        "Avisar responsável", OPERATOR,
    ),
    "incomplete": (
        "Para andar, falta: {campos}.",
        "Completar", USER,
    ),
    "activation_rules_not_explicit": (
        "Este tipo existe, mas ainda não publicou regras semânticas completas para ativação.",
        "Avisar responsável", OPERATOR,
    ),
    "did_not_admitted": (
        "O ato informado não é admitido por este tipo de processo.",
        "Reformular pedido", USER,
    ),
    "confirmed_by_not_authorized": (
        "A confirmação informada não pertence a uma autoridade admitida por este processo.",
        "Confirmar novamente", USER,
    ),
    "this_not_canonical": (
        "O alvo informado não é uma referência canônica válida para este processo.",
        "Corrigir alvo", USER,
    ),
    "this_not_content_hash": (
        "Este processo exige que o alvo seja um hash de conteúdo de 64 caracteres.",
        "Corrigir alvo", USER,
    ),
    "when_invalid": (
        "O instante informado não é uma data ISO 8601 com fuso horário.",
        "Corrigir data", USER,
    ),
    "when_not_future": (
        "Este processo exige um instante futuro, mas a data informada já passou.",
        "Escolher outra data", USER,
    ),
    "confirmation_evidence_invalid": (
        "A confirmação não contém o hash de evidência exigido por este processo.",
        "Fornecer evidência", USER,
    ),
    "if_ok_incompatible": (
        "A continuidade de sucesso não corresponde ao contrato citado.",
        "Ver composição", OPERATOR,
    ),
    "if_doubt_incompatible": (
        "A continuidade de dúvida não corresponde ao contrato citado.",
        "Ver composição", OPERATOR,
    ),
    "if_not_incompatible": (
        "A continuidade negativa não corresponde ao contrato citado.",
        "Ver composição", OPERATOR,
    ),
    "status_initial_invalid": (
        "O estado inicial não é admitido pelo contrato deste processo.",
        "Ver composição", OPERATOR,
    ),
    "unknown_predicate": (
        "O contrato usa um predicado de ativação que este runtime não implementa.",
        "Corrigir contrato", OPERATOR,
    ),
    # -- the action behind the type ---------------------------------------------
    "no_adapter_configured": (
        "Este tipo existe, mas ainda não executa nada.",
        "Avisar responsável", OPERATOR,
    ),
    "adapter_not_registered": (
        "A ação que este tipo pede ainda não existe neste sistema.",
        "Avisar responsável", OPERATOR,
    ),
    "dispatch_mismatch": (
        "A solicitação foi preparada com uma ação diferente da que a regra pede agora. "
        "Nada foi executado.",
        "Reenviar", USER,
    ),
    # -- authorization required --------------------------------------------------
    "missing_required_grant": (
        "Para andar, precisa de autorização assinada.",
        "Pedir autorização", USER,
    ),
    # -- authorization invalid ---------------------------------------------------
    "grant_not_found": (
        "A autorização indicada não existe.",
        "Pedir autorização", USER,
    ),
    "grant_subject_mismatch": (
        "Esta autorização foi dada para outra pessoa.",
        "Pedir autorização", USER,
    ),
    "grant_process_mismatch": (
        "Esta autorização não vale para este tipo de solicitação.",
        "Pedir autorização", USER,
    ),
    "grant_adapter_mismatch": (
        "Esta autorização não cobre a ação que seria executada.",
        "Pedir autorização", USER,
    ),
    "who_not_authorized": (
        "Você não está na lista de quem pode fazer isto.",
        "Pedir acesso", USER,
    ),
    "grant_not_active": (
        "Esta autorização não está ativa.",
        "Pedir autorização", USER,
    ),
    "grant_revoked": (
        "Esta autorização foi cancelada.",
        "Pedir autorização", USER,
    ),
    "grant_expired": (
        "A autorização venceu em {data}.",
        "Renovar", USER,
    ),
    "budget_exhausted": (
        "O limite de uso desta autorização acabou.",
        "Pedir aumento", USER,
    ),
    "missing_grant_expiry": (
        "A autorização não tem prazo de validade. Por segurança, não vale.",
        "Avisar responsável", OPERATOR,
    ),
    "missing_timeout": (
        "A autorização não define tempo limite de execução.",
        "Avisar responsável", OPERATOR,
    ),
    "missing_sandbox_scope": (
        "A autorização não define onde a ação pode mexer.",
        "Avisar responsável", OPERATOR,
    ),
    "missing_network_policy": (
        "A autorização não define o que a ação pode acessar na rede.",
        "Avisar responsável", OPERATOR,
    ),
    # -- who signs ---------------------------------------------------------------
    "missing_authority": (
        "Não foi informado quem autoriza.",
        "Avisar responsável", OPERATOR,
    ),
    "unregistered_authority": (
        "Quem concedeu não está registrado como autorizador.",
        "Avisar responsável", OPERATOR,
    ),
    "grant_unsigned": (
        "A autorização ainda não foi assinada com chave de segurança.",
        "Assinar", USER,
    ),
    "signoff_signer_mismatch": (
        "A assinatura é de outra pessoa, não de quem concedeu a autorização.",
        "Assinar de novo", USER,
    ),
    "signature_layer_unavailable": (
        "A verificação por chave de segurança não está disponível neste dispositivo.",
        "Ver como habilitar", OPERATOR,
    ),
    # -- evidence ----------------------------------------------------------------
    "evidence_obligation_unmet": (
        "A ação rodou, mas não comprovou {campos}. Nada foi dado como concluído.",
        "Ver o que foi produzido", OPERATOR,
    ),
    "adapter_rejected": (
        "A ação foi recusada com segurança: {motivo}.",
        "Ver detalhe", OPERATOR,
    ),
}

FALLBACK = ("Parou por um motivo que esta interface ainda não sabe explicar.", "Ver detalhe", OPERATOR)


def _join(values: Any) -> str:
    """Render a field list the way a person reads one: 'a, b e c'."""
    items = [str(value) for value in (values or []) if str(value)]
    if not items:
        return "algum campo"
    if len(items) == 1:
        return items[0]
    return f"{', '.join(items[:-1])} e {items[-1]}"


def render(reason: str, receipt: dict[str, Any] | None = None) -> dict[str, Any]:
    """Turn a doubt receipt into what a person reads, plus the one action offered."""
    receipt = receipt or {}
    template, action, resolved_by = CATALOG.get(reason, FALLBACK)
    missing = receipt.get("missing_evidence") or receipt.get("missing_aux") or receipt.get("missing_slots")
    message = template.format(
        campos=_join(missing),
        data=receipt.get("valid_until") or receipt.get("expired_at") or "uma data anterior",
        motivo=receipt.get("adapter_error") or receipt.get("reason") or "sem detalhe",
    )
    return {
        "code": reason,
        "message": message,
        "action": action,
        "resolved_by": resolved_by,
        "known": reason in CATALOG,
    }


def catalog() -> list[dict[str, str]]:
    """The whole catalog, for an interface that wants to render it without hardcoding."""
    return [
        {"code": code, "template": template, "action": action, "resolved_by": resolved_by}
        for code, (template, action, resolved_by) in sorted(CATALOG.items())
    ]
