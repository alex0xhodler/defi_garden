"""
Unit tests for DeFi Garden v2 Card BaaS Adapter Layer.
Validates zero-upfront requirement, deposit proxy resolution, and authorization policy gates.
"""

import pytest
from adapters.card_baas_adapter import (
    get_card_baas_adapter,
    Fiat24Adapter,
    KulipaAdapter,
    HolyheldAdapter,
)

SAMPLE_WALLET = "0x0d79860366926b7685428dcd2b2d1eefcbd45178"
SAMPLE_CARD_ID = "card_v2_claude_pro_001"

def test_adapter_factory():
    fiat24 = get_card_baas_adapter("fiat24")
    assert isinstance(fiat24, Fiat24Adapter)
    assert fiat24.provider_name == "fiat24"

    kulipa = get_card_baas_adapter("kulipa")
    assert isinstance(kulipa, KulipaAdapter)
    assert kulipa.provider_name == "kulipa"

    holyheld = get_card_baas_adapter("holyheld")
    assert isinstance(holyheld, HolyheldAdapter)
    assert holyheld.provider_name == "holyheld"

    with pytest.raises(ValueError, match="Unsupported BaaS provider"):
        get_card_baas_adapter("rain")  # Rain is rejected


def test_zero_upfront_fee_invariant():
    for name in ["fiat24", "kulipa", "holyheld"]:
        adapter = get_card_baas_adapter(name)
        status = adapter.get_card_status(SAMPLE_CARD_ID)
        assert status["setup_fee_usd"] == 0.0
        assert status["status"] == "ACTIVE"


def test_deposit_address_resolution():
    adapter = get_card_baas_adapter("fiat24")
    proxy_address = adapter.resolve_deposit_address(SAMPLE_WALLET, SAMPLE_CARD_ID)
    assert proxy_address.startswith("0x")
    assert len(proxy_address) == 42

    with pytest.raises(ValueError, match="Invalid Ethereum address"):
        adapter.resolve_deposit_address("invalid_address", SAMPLE_CARD_ID)


def test_authorization_policy_gates():
    adapter = get_card_baas_adapter("fiat24")

    # Valid SaaS purchase (Claude Pro - $20, MCC 7372)
    auth_valid = adapter.simulate_authorization(SAMPLE_CARD_ID, 20.0, "7372")
    assert auth_valid["authorized"] is True
    assert auth_valid["amount_usd"] == 20.0
    assert auth_valid["invariant_principal_protected"] is True

    # Invalid non-SaaS MCC (e.g. Gambling MCC 7995)
    auth_invalid_mcc = adapter.simulate_authorization(SAMPLE_CARD_ID, 50.0, "7995")
    assert auth_invalid_mcc["authorized"] is False
    assert "NOT_IN_PERMITTED_SAAS_POLICY" in auth_invalid_mcc["reason"]

    # Invalid amount
    auth_zero = adapter.simulate_authorization(SAMPLE_CARD_ID, 0.0, "7372")
    assert auth_zero["authorized"] is False


def test_settlement_and_interchange_calculation():
    adapter = get_card_baas_adapter("fiat24")
    settlement = adapter.calculate_settlement(100.0)
    assert settlement["gross_usd"] == 100.0
    assert settlement["fee_usd"] == 0.0
    assert settlement["interchange_rebate_usd"] == 0.50  # 50 bps on $100
    assert settlement["net_usd"] == 100.0
