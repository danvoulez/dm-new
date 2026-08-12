"""Domain exceptions for the Lab kernel."""

class LabError(Exception):
    """Base class for expected Lab runtime failures."""

class ReceiptError(LabError):
    """Receipt is malformed or violates LogLine receipt rules."""

class NotFound(LabError):
    """Requested record does not exist."""

class Conflict(LabError):
    """Requested state transition conflicts with current state."""

class ContractError(LabError):
    """Process contract cannot be loaded or honored."""

class AdapterError(LabError):
    """Adapter failed without producing a valid result receipt."""

class AuthorityError(LabError):
    """An authority action was attempted by a non-recognized registrar."""

class BootstrapError(LabError):
    """A bench bootstrap operation was unsafe or invalid (e.g. destructive reset
    outside the bench, or genesis on a non-empty ledger)."""
