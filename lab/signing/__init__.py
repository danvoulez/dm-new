"""Optional cryptographic signature-binding boundary (passkey / WebAuthn).

This subpackage is the ONLY part of the Lab that depends on asymmetric crypto. It is
an optional extra (``pip install dream-machine-lab[webauthn]``); the zero-dependency
kernel never imports it directly — ``lab.authority.verify_signature`` loads it lazily
and degrades honestly when it is absent.
"""
