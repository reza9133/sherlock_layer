# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""SherlockLayer — A Decentralized Mystery & ARG Adjudication Protocol

=====================================================================

Creators open a Mystery Case with a secret solution rubric and a GEN bounty.
Hunters directly submit their deduction/evidence text. GenLayer's AI
evaluates the submitted text against the secret criteria. On SOLVED, the
verified solver can claim the locked bounty directly via `claim_bounty`.
"""

from dataclasses import dataclass
import collections.abc
import functools
from genlayer import *


# ──────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────

ZERO_ADDRESS = Address("0x0000000000000000000000000000000000000000")

CASE_STATUS_OPEN = "OPEN"
CASE_STATUS_SOLVED = "SOLVED"
CASE_STATUS_CLAIMED = "CLAIMED"
CASE_STATUS_CANCELLED = "CANCELLED"
CASE_STATUS_EXPIRED = "EXPIRED"

MAX_PAGE_SIZE = 50
MAX_ATTEMPTS_PER_CASE = 25
MAX_EVIDENCE_CHARS = 4000


# ──────────────────────────────────────────────────────────────────────
# Storage-safe dataclasses
# ──────────────────────────────────────────────────────────────────────


@allow_storage
@dataclass
class MysteryCase:
    case_id: u256
    creator: Address
    title: str
    description: str
    solution_criteria: str
    bounty: u256
    status: str
    solver: Address
    evidence_text: str
    last_verdict_reasoning: str
    attempts: u256


@allow_storage
@dataclass
class PublicCaseView:
    case_id: u256
    creator: Address
    title: str
    description: str
    bounty: u256
    status: str
    solver: Address
    evidence_text: str
    last_verdict_reasoning: str
    attempts: u256


@allow_storage
@dataclass
class ProtocolStats:
    total_cases: u256
    total_cases_solved: u256
    total_bounty_paid: u256


def _public_case_view(case: MysteryCase) -> PublicCaseView:
    return PublicCaseView(
        case_id=case.case_id,
        creator=case.creator,
        title=case.title,
        description=case.description,
        bounty=case.bounty,
        status=case.status,
        solver=case.solver,
        evidence_text=case.evidence_text,
        last_verdict_reasoning=case.last_verdict_reasoning,
        attempts=case.attempts,
    )


# ──────────────────────────────────────────────────────────────────────
# Top-Level Pure Evaluation Function (GenVM Compliant)
# ──────────────────────────────────────────────────────────────────────


def _evaluate_evidence_nondet(
    title: str, criteria: str, evidence_text: str
) -> str:
    prompt = f"""You are an unbiased mystery case adjudicator.

Case Title: {title}
Solution Criteria: {criteria}

Submitted Evidence by Hunter:
\"\"\"
{evidence_text}
\"\"\"

TASK:
Check if the Hunter's submitted evidence satisfies the solution criteria or answers the mystery correctly.
Reply strictly with SOLVED if it meets the criteria, or UNSOLVED if it fails.
Do not output anything else."""

    ai_output = gl.nondet.exec_prompt(prompt)
    clean_out = ai_output.strip().upper()
    if "SOLVED" in clean_out and "UNSOLVED" not in clean_out:
        return "SOLVED"
    return "UNSOLVED"


# ──────────────────────────────────────────────────────────────────────
# Safe Transfer Helper
# ──────────────────────────────────────────────────────────────────────


def _safe_transfer(payee: Address, amount: u256) -> None:
    try:
        if amount > u256(0) and payee != ZERO_ADDRESS:
            payee.emit_transfer(value=amount)
    except Exception:
        pass


# ──────────────────────────────────────────────────────────────────────
# Contract
# ──────────────────────────────────────────────────────────────────────


class SherlockLayer(gl.Contract):
    cases: TreeMap[u256, MysteryCase]
    next_case_id: u256
    total_cases_solved: u256
    total_bounty_paid: u256

    def __init__(self):
        self.cases = TreeMap()
        self.next_case_id = u256(1)
        self.total_cases_solved = u256(0)
        self.total_bounty_paid = u256(0)

    @gl.public.write.payable
    def create_case(
        self, title: str, description: str, solution_criteria: str
    ) -> u256:
        if gl.message.value <= 0:
            raise gl.vm.UserError(
                "A bounty deposit (GEN) is required to open a case"
            )
        if len(title.strip()) == 0:
            raise gl.vm.UserError("Title is required")
        if len(solution_criteria.strip()) < 3:
            raise gl.vm.UserError("Solution criteria is required")

        case_id = self.next_case_id
        self.cases[case_id] = MysteryCase(
            case_id=case_id,
            creator=gl.message.sender_address,
            title=title,
            description=description,
            solution_criteria=solution_criteria,
            bounty=u256(gl.message.value),
            status=CASE_STATUS_OPEN,
            solver=ZERO_ADDRESS,
            evidence_text="",
            last_verdict_reasoning="",
            attempts=u256(0),
        )
        self.next_case_id = u256(int(self.next_case_id) + 1)
        return case_id

    @gl.public.write
    def submit_evidence(self, case_id: u256, evidence_text: str) -> str:
        case = self.cases.get(case_id, None)
        if case is None:
            raise gl.vm.UserError("Case does not exist")
        if case.status != CASE_STATUS_OPEN:
            raise gl.vm.UserError(
                f"Case is not open for submissions (status: {case.status})"
            )
        if case.creator == gl.message.sender_address:
            raise gl.vm.UserError(
                "Case creator cannot submit evidence for their own case"
            )

        evidence_clean = evidence_text.strip()
        if len(evidence_clean) == 0:
            raise gl.vm.UserError("Evidence text is required")

        if int(case.attempts) >= MAX_ATTEMPTS_PER_CASE:
            case.status = CASE_STATUS_EXPIRED
            self.cases[case_id] = case
            raise gl.vm.UserError(
                "This case has hit its maximum investigation attempts"
            )

        case.evidence_text = evidence_clean[:MAX_EVIDENCE_CHARS]
        case.attempts = u256(int(case.attempts) + 1)

        eval_fn = functools.partial(
            _evaluate_evidence_nondet,
            case.title,
            case.solution_criteria,
            case.evidence_text,
        )

        verdict = gl.eq_principle.strict_eq(eval_fn)

        if verdict == "SOLVED":
            case.last_verdict_reasoning = (
                "AI validated: Evidence satisfies the solution criteria."
            )
            case.status = CASE_STATUS_SOLVED
            case.solver = gl.message.sender_address
            self.cases[case_id] = case

            self.total_cases_solved = u256(int(self.total_cases_solved) + 1)
        else:
            case.last_verdict_reasoning = (
                "AI rejected: Evidence does not satisfy the criteria."
            )
            case.status = CASE_STATUS_OPEN
            self.cases[case_id] = case

        return verdict

    @gl.public.write
    def claim_bounty(self, case_id: u256) -> None:
        case = self.cases.get(case_id, None)
        if case is None:
            raise gl.vm.UserError("Case does not exist")
        if case.status != CASE_STATUS_SOLVED:
            raise gl.vm.UserError(
                f"Case is not ready for claim (status: {case.status})"
            )
        if case.solver != gl.message.sender_address:
            raise gl.vm.UserError(
                "Only the verified solver can claim this bounty"
            )

        reward = case.bounty
        case.status = CASE_STATUS_CLAIMED
        self.cases[case_id] = case

        self.total_bounty_paid = u256(
            int(self.total_bounty_paid) + int(reward)
        )

        _safe_transfer(case.solver, reward)

    @gl.public.write
    def cancel_case(self, case_id: u256) -> None:
        case = self.cases.get(case_id, None)
        if case is None:
            raise gl.vm.UserError("Case does not exist")
        if case.creator != gl.message.sender_address:
            raise gl.vm.UserError("Only the case creator can cancel this case")
        if case.status != CASE_STATUS_OPEN:
            raise gl.vm.UserError("Only an OPEN case can be cancelled")

        refund = case.bounty
        case.status = CASE_STATUS_CANCELLED
        self.cases[case_id] = case

        _safe_transfer(case.creator, refund)

    # ------------------------------------------------------------------
    # Views
    # ------------------------------------------------------------------

    @gl.public.view
    def get_case_count(self) -> u256:
        return u256(len(self.cases))

    @gl.public.view
    def get_stats(self) -> ProtocolStats:
        return ProtocolStats(
            total_cases=u256(len(self.cases)),
            total_cases_solved=self.total_cases_solved,
            total_bounty_paid=self.total_bounty_paid,
        )

    @gl.public.view
    def get_case(self, case_id: u256) -> PublicCaseView:
        case = self.cases.get(case_id, None)
        if case is None:
            raise gl.vm.UserError("Case does not exist")
        return _public_case_view(case)

    @gl.public.view
    def get_cases(
        self, offset: u256, limit: u256
    ) -> collections.abc.Sequence[PublicCaseView]:
        offset_i = int(offset)
        limit_i = min(int(limit), MAX_PAGE_SIZE)

        all_ids = list(self.cases.keys())
        all_ids.reverse()
        page_ids = all_ids[offset_i : offset_i + limit_i]

        result: list[PublicCaseView] = []
        for cid in page_ids:
            result.append(_public_case_view(self.cases[cid]))
        return result

    @gl.public.view
    def get_cases_by_creator(
        self, creator: Address, offset: u256, limit: u256
    ) -> collections.abc.Sequence[PublicCaseView]:
        offset_i = int(offset)
        limit_i = min(int(limit), MAX_PAGE_SIZE)

        matches: list[MysteryCase] = []
        for cid in reversed(list(self.cases.keys())):
            case = self.cases[cid]
            if case.creator == creator:
                matches.append(case)

        page = matches[offset_i : offset_i + limit_i]
        return [_public_case_view(case) for case in page]
