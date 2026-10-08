import re


def _topic_title(content: str) -> str:
    cleaned = re.sub(r"\s+", " ", content.strip())
    return cleaned[:52] + ("…" if len(cleaned) > 52 else "")


def generate_reply(content: str) -> str:
    prompt = content.lower()

    if any(word in prompt for word in ("physics", "force", "motion", "rotational", "electrostatics", "newton")):
        return (
            "## Let's unpack the Physics\n\n"
            "The key is to start from the governing idea, then translate the words into a diagram and an equation.\n\n"
            "### Concept used\n"
            "For a body of mass **m**, Newton's second law is **F = ma**. Force and acceleration are vectors, so choose a positive direction before substituting values.\n\n"
            "### A JEE-ready approach\n"
            "1. Draw the free-body diagram and label every external force.\n"
            "2. Resolve forces along the direction of motion.\n"
            "3. Write the net equation and check the units.\n\n"
            "**JEE tip:** If a constraint or rotation is involved, look for the quantity that stays conserved before expanding into algebra.\n\n"
            f"I can take **{_topic_title(content)}** further with a numerical example if you share the values."
        )

    if any(word in prompt for word in ("chemistry", "organic", "sn1", "sn2", "electrochem", "reaction", "bond")):
        return (
            "## Chemistry, made systematic\n\n"
            "First identify the reaction family, then track electron movement rather than memorising isolated products.\n\n"
            "### Concept used\n"
            "In an **SN1** reaction, the rate depends mainly on substrate concentration because carbocation formation is the slow step. **SN2** is a one-step backside attack, so steric hindrance and nucleophile strength matter.\n\n"
            "### How to solve it\n"
            "1. Classify the substrate as primary, secondary, or tertiary.\n"
            "2. Check the solvent and nucleophile.\n"
            "3. Compare the transition-state or carbocation stability.\n\n"
            "**JEE tip:** Always write the intermediate or transition state. It prevents common product and stereochemistry mistakes."
        )

    if any(word in prompt for word in ("math", "mathematics", "integral", "calculus", "quadratic", "algebra", "equation")):
        return (
            "## Let's solve it step by step\n\n"
            "### Given\n"
            "Rewrite the expression in a form where one standard identity or substitution is visible. For a quadratic, keep **ax² + bx + c = 0** as the reference form.\n\n"
            "### Method\n"
            "1. Define the variable and its domain.\n"
            "2. Simplify before differentiating or integrating.\n"
            "3. Apply the boundary conditions and verify the result in the original expression.\n\n"
            "For example, the standard integral is **∫₀¹ x² dx = 1/3**.\n\n"
            "**JEE tip:** Check domain restrictions at the end; an algebraically valid step can still introduce an extraneous root."
        )

    if any(word in prompt for word in ("practice", "quiz", "questions", "test")):
        return (
            "## Practice set ready\n\n"
            "I would begin with a balanced JEE set: 2 warm-up questions, 2 application problems, and 1 stretch problem. After you answer, I can explain only the steps where your reasoning diverged.\n\n"
            "Tell me the subject and topic, or use **Daily 20** for a mixed set across Physics, Chemistry, and Mathematics."
        )

    return (
        "## Let's make this exam-ready\n\n"
        "Start by sharing what you know, what feels confusing, and whether you want a hint or a complete solution. I will keep the explanation focused on JEE-level reasoning.\n\n"
        "You can ask me to **explain a concept**, **solve step by step**, or **create practice questions** for Physics, Chemistry, or Mathematics."
    )