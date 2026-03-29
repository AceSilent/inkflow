"""Tests for enhanced skill registry with categories and new tools."""
import pytest
from src.core.agent_tools import SKILL_REGISTRY, list_skills, load_skill, TERMINAL_TOOLS


def test_skill_registry_has_categories():
    for name, info in SKILL_REGISTRY.items():
        assert "category" in info, f"Skill '{name}' missing 'category'"
        assert "when_to_use" in info, f"Skill '{name}' missing 'when_to_use'"
        assert info["category"] in ("writing", "plotting", "worldbuilding", "planning"), \
            f"Skill '{name}' has invalid category '{info['category']}'"


def test_list_skills_grouped():
    output = list_skills()
    assert "写作技法 (writing)" in output
    assert "剧情构建 (plotting)" in output
    assert "世界观与角色 (worldbuilding)" in output
    assert "规划 (planning)" in output


def test_list_skills_contains_all():
    output = list_skills()
    for name in SKILL_REGISTRY:
        assert name in output, f"Skill '{name}' not in list_skills() output"


def test_load_existing_skill():
    result = load_skill("iceberg_writing")
    assert "Error" not in result
    assert len(result) > 100  # should be a substantial document


def test_load_lore_compliance_skill():
    result = load_skill("lore_compliance")
    assert "Error" not in result


def test_load_nonexistent_skill():
    result = load_skill("does_not_exist")
    assert "Error" in result


def test_terminal_tools_defined():
    assert "present_options" in TERMINAL_TOOLS
    assert "request_guidance" in TERMINAL_TOOLS
    assert "submit_for_review" in TERMINAL_TOOLS


def test_skill_count():
    """We should have at least 9 skills (2 existing + 7 new)."""
    assert len(SKILL_REGISTRY) >= 9


def test_categories_have_skills():
    """Each category should have at least one skill."""
    cats = set(info["category"] for info in SKILL_REGISTRY.values())
    assert "writing" in cats
    assert "plotting" in cats
    assert "worldbuilding" in cats
    assert "planning" in cats
