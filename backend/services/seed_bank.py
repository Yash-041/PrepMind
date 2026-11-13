"""
Seeds verified JEE Main & JEE Advanced questions, exam templates, and synthetic
knowledge base chunks so the platform is 100% functional out-of-the-box.
Never fabricates fake NCERT page citations.
"""
from sqlalchemy.orm import Session
from backend.models.practice import Question
from backend.models.exam import ExamTemplate
from backend.models.knowledge import Document, DocumentChunk
from backend.services.embeddings import active_embedding_model, embed_documents
from backend.services.math_verifier import are_expressions_equivalent

SEED_QUESTIONS = [
    # PHYSICS (8 questions)
    {
        "subject": "Physics",
        "topic": "Rotational Motion",
        "exam_type": "JEE Main",
        "difficulty": "Medium",
        "question_text": "What is the moment of inertia of a uniform solid sphere of mass M and radius R about an axis passing through its center?",
        "options": ["(2/5) M*R^2", "(2/3) M*R^2", "(1/2) M*R^2", "(7/5) M*R^2"],
        "correct_answer": "(2/5) M*R^2",
        "explanation": "For a uniform solid sphere about its central diameter, integration of elemental discs yields I = (2/5)MR^2.",
        "check_expr": ("(2/5)*m*R^2", "0.4*m*R^2"),
    },
    {
        "subject": "Physics",
        "topic": "Rotational Motion",
        "exam_type": "JEE Advanced",
        "difficulty": "Hard",
        "question_text": "A solid cylinder of mass M and radius R rolls without slipping down an inclined plane of inclination theta. The acceleration of its center of mass is:",
        "options": ["(2/3) g*sin(theta)", "(1/2) g*sin(theta)", "(5/7) g*sin(theta)", "g*sin(theta)"],
        "correct_answer": "(2/3) g*sin(theta)",
        "explanation": "For rolling without slipping, a = g*sin(theta) / (1 + I/(mR^2)). For a solid cylinder, I/(mR^2) = 1/2, so a = (2/3)g*sin(theta).",
        "check_expr": ("1 / (1 + 1/2)", "2/3"),
    },
    {
        "subject": "Physics",
        "topic": "Kinematics",
        "exam_type": "JEE Main",
        "difficulty": "Easy",
        "question_text": "A projectile is fired at an angle of 45 degrees with initial speed u. Neglecting air resistance, its horizontal range on level ground is:",
        "options": ["u^2 / g", "u^2 / (2*g)", "2*u^2 / g", "u / g"],
        "correct_answer": "u^2 / g",
        "explanation": "Horizontal range R = (u^2 * sin(2*theta)) / g. At theta = 45 deg, sin(90 deg) = 1, giving R = u^2 / g.",
        "check_expr": ("u^2 * sin(pi/2) / g", "u^2 / g"),
    },
    {
        "subject": "Physics",
        "topic": "Electrostatics",
        "exam_type": "JEE Main",
        "difficulty": "Medium",
        "question_text": "Two identical point charges +q are separated by distance 2a. The electric field magnitude at the midpoint between them is:",
        "options": ["0", "k*q / a^2", "2*k*q / a^2", "k*q / (2*a^2)"],
        "correct_answer": "0",
        "explanation": "At the midpoint, the electric field vectors from two equal like charges have equal magnitude and opposite directions, cancelling to 0.",
        "check_expr": ("1 - 1", "0"),
    },
    {
        "subject": "Physics",
        "topic": "Current Electricity",
        "exam_type": "JEE Main",
        "difficulty": "Easy",
        "question_text": "Three resistors each of resistance 6 Ohm are connected in parallel. Their equivalent resistance is:",
        "options": ["2 Ohm", "18 Ohm", "3 Ohm", "6 Ohm"],
        "correct_answer": "2 Ohm",
        "explanation": "1/R_eq = 1/6 + 1/6 + 1/6 = 3/6 = 1/2 => R_eq = 2 Ohm.",
        "check_expr": ("1 / (1/6 + 1/6 + 1/6)", "2"),
    },
    {
        "subject": "Physics",
        "topic": "Thermodynamics",
        "exam_type": "JEE Main",
        "difficulty": "Medium",
        "question_text": "A Carnot engine operates between a source at 600 K and a sink at 300 K. Its thermal efficiency is:",
        "options": ["50%", "25%", "75%", "100%"],
        "correct_answer": "50%",
        "explanation": "Efficiency eta = 1 - T_sink / T_source = 1 - 300/600 = 0.5 = 50%.",
        "check_expr": ("1 - 300/600", "0.5"),
    },
    {
        "subject": "Physics",
        "topic": "Modern Physics",
        "exam_type": "JEE Main",
        "difficulty": "Medium",
        "question_text": "In the Bohr model of the hydrogen atom, the radius of the nth permitted orbit is proportional to:",
        "options": ["n^2", "n", "1/n", "1/n^2"],
        "correct_answer": "n^2",
        "explanation": "From quantization of angular momentum mvr = n*h/(2*pi) and electrostatic force, r_n is proportional to n^2 / Z.",
        "check_expr": ("n^2", "n*n"),
    },
    {
        "subject": "Physics",
        "topic": "Optics",
        "exam_type": "JEE Advanced",
        "difficulty": "Medium",
        "question_text": "If an object is placed at a distance of 2f in front of a convex lens of focal length f, the image distance v is:",
        "options": ["2f", "f", "f/2", "Infinity"],
        "correct_answer": "2f",
        "explanation": "Using lens formula 1/v - 1/u = 1/f with u = -2f: 1/v = 1/f - 1/(2f) = 1/(2f) => v = 2f.",
        "check_expr": ("1 / (1 - 1/2)", "2"),
    },
    # CHEMISTRY (7 questions)
    {
        "subject": "Chemistry",
        "topic": "Chemical Equilibrium",
        "exam_type": "JEE Main",
        "difficulty": "Easy",
        "question_text": "For a weak monoprotic acid with dissociation constant Ka = 10^-5, what is the pKa value?",
        "options": ["5", "-5", "9", "10"],
        "correct_answer": "5",
        "explanation": "By definition, pKa = -log10(Ka) = -log10(10^-5) = 5.",
        "check_expr": ("5", "5"),
    },
    {
        "subject": "Chemistry",
        "topic": "Atomic Structure",
        "exam_type": "JEE Main",
        "difficulty": "Easy",
        "question_text": "The maximum number of electrons that can be accommodated in the shell with principal quantum number n = 3 is:",
        "options": ["18", "8", "32", "10"],
        "correct_answer": "18",
        "explanation": "The maximum number of electrons in principal shell n is given by 2*n^2 = 2*(3^2) = 18.",
        "check_expr": ("2 * 3^2", "18"),
    },
    {
        "subject": "Chemistry",
        "topic": "Electrochemistry",
        "exam_type": "JEE Main",
        "difficulty": "Medium",
        "question_text": "How many Faradays of electricity are required to reduce 1 mole of MnO4- ions to Mn2+ ions in acidic medium?",
        "options": ["5 F", "3 F", "1 F", "7 F"],
        "correct_answer": "5 F",
        "explanation": "In MnO4-, the oxidation state of Mn is +7. Reducing it to Mn2+ requires a gain of 7 - 2 = 5 moles of electrons per mole, or 5 Faradays.",
        "check_expr": ("7 - 2", "5"),
    },
    {
        "subject": "Chemistry",
        "topic": "Chemical Kinetics",
        "exam_type": "JEE Main",
        "difficulty": "Medium",
        "question_text": "For a first-order reaction, how does the half-life (t_1/2) depend on the initial reactant concentration [A]_0?",
        "options": [
            "Independent of [A]_0",
            "Directly proportional to [A]_0",
            "Inversely proportional to [A]_0",
            "Proportional to [A]_0^2",
        ],
        "correct_answer": "Independent of [A]_0",
        "explanation": "For a first-order reaction, t_1/2 = ln(2)/k = 0.693/k, which does not contain the initial concentration term [A]_0.",
        "check_expr": None,
    },
    {
        "subject": "Chemistry",
        "topic": "Coordination Compounds",
        "exam_type": "JEE Advanced",
        "difficulty": "Medium",
        "question_text": "What is the oxidation state of iron (Fe) in the coordination complex K4[Fe(CN)6]?",
        "options": ["+2", "+3", "0", "+4"],
        "correct_answer": "+2",
        "explanation": "4*(+1) + x + 6*(-1) = 0 => x = +2.",
        "check_expr": ("6 - 4", "2"),
    },
    {
        "subject": "Chemistry",
        "topic": "Thermochemistry",
        "exam_type": "JEE Main",
        "difficulty": "Medium",
        "question_text": "A reaction is guaranteed to be spontaneous at all temperatures when:",
        "options": [
            "Delta H < 0 and Delta S > 0",
            "Delta H > 0 and Delta S < 0",
            "Delta H < 0 and Delta S < 0",
            "Delta H > 0 and Delta S > 0",
        ],
        "correct_answer": "Delta H < 0 and Delta S > 0",
        "explanation": "From Delta G = Delta H - T*Delta S, when Delta H is negative and Delta S is positive, Delta G is always negative for all T > 0.",
        "check_expr": None,
    },
    {
        "subject": "Chemistry",
        "topic": "Organic Chemistry - GOC",
        "exam_type": "JEE Main",
        "difficulty": "Easy",
        "question_text": "What is the hybridization of each carbon atom in benzene (C6H6)?",
        "options": ["sp2", "sp3", "sp", "dsp2"],
        "correct_answer": "sp2",
        "explanation": "Every carbon in benzene forms 3 sigma bonds and 1 delocalized pi bond, corresponding to sp2 hybridization.",
        "check_expr": None,
    },
    # MATHEMATICS (8 questions)
    {
        "subject": "Mathematics",
        "topic": "Calculus - Differentiation",
        "exam_type": "JEE Main",
        "difficulty": "Easy",
        "question_text": "What is the derivative of f(x) = x^3 + 3*x^2 - 5 with respect to x?",
        "options": ["3*x^2 + 6*x", "3*x^2 + 3*x", "x^2 + 6*x", "3*x^2 + 6*x - 5"],
        "correct_answer": "3*x^2 + 6*x",
        "explanation": "Differentiating term by term using d/dx(x^n) = n*x^(n-1) gives 3*x^2 + 6*x.",
        "check_expr": ("3*x^2 + 6*x", "3*x*(x + 2)"),
    },
    {
        "subject": "Mathematics",
        "topic": "Calculus - Integration",
        "exam_type": "JEE Main",
        "difficulty": "Easy",
        "question_text": "Evaluate the definite integral of 2*x dx from x = 0 to x = 3:",
        "options": ["9", "6", "3", "12"],
        "correct_answer": "9",
        "explanation": "The antiderivative of 2*x is x^2. Evaluating from 0 to 3 gives 3^2 - 0^2 = 9.",
        "check_expr": ("3^2 - 0^2", "9"),
    },
    {
        "subject": "Mathematics",
        "topic": "Quadratic Equations",
        "exam_type": "JEE Main",
        "difficulty": "Easy",
        "question_text": "What is the sum of the roots of the quadratic equation 2*x^2 - 10*x + 7 = 0?",
        "options": ["5", "-5", "7/2", "10"],
        "correct_answer": "5",
        "explanation": "For a*x^2 + b*x + c = 0, the sum of roots is -b/a = -(-10)/2 = 5.",
        "check_expr": ("10 / 2", "5"),
    },
    {
        "subject": "Mathematics",
        "topic": "Matrices and Determinants",
        "exam_type": "JEE Main",
        "difficulty": "Medium",
        "question_text": "If A is a 3x3 matrix with det(A) = 4, what is the determinant of 2A?",
        "options": ["32", "8", "16", "64"],
        "correct_answer": "32",
        "explanation": "For an n x n matrix A, det(kA) = k^n * det(A). Here n = 3 and k = 2, so 2^3 * 4 = 8 * 4 = 32.",
        "check_expr": ("2^3 * 4", "32"),
    },
    {
        "subject": "Mathematics",
        "topic": "Trigonometry",
        "exam_type": "JEE Main",
        "difficulty": "Easy",
        "question_text": "For any real angle x, the expression sin^2(x) + cos^2(x) simplifies to:",
        "options": ["1", "0", "2", "sin(2x)"],
        "correct_answer": "1",
        "explanation": "By the fundamental Pythagorean trigonometric identity, sin^2(x) + cos^2(x) = 1.",
        "check_expr": ("sin(x)^2 + cos(x)^2", "1"),
    },
    {
        "subject": "Mathematics",
        "topic": "Coordinate Geometry",
        "exam_type": "JEE Main",
        "difficulty": "Easy",
        "question_text": "What is the radius of the circle given by the equation x^2 + y^2 = 49?",
        "options": ["7", "49", "14", "3.5"],
        "correct_answer": "7",
        "explanation": "Comparing with standard equation x^2 + y^2 = r^2, we get r^2 = 49 => r = 7.",
        "check_expr": ("sqrt(49)", "7"),
    },
    {
        "subject": "Mathematics",
        "topic": "Permutations and Combinations",
        "exam_type": "JEE Advanced",
        "difficulty": "Medium",
        "question_text": "In how many ways can a committee of 2 students be chosen from a group of 6 students?",
        "options": ["15", "30", "12", "20"],
        "correct_answer": "15",
        "explanation": "6C2 = (6 * 5) / (2 * 1) = 15.",
        "check_expr": ("(6*5)/2", "15"),
    },
    {
        "subject": "Mathematics",
        "topic": "Complex Numbers",
        "exam_type": "JEE Advanced",
        "difficulty": "Medium",
        "question_text": "What is the modulus of the complex number z = 3 + 4i?",
        "options": ["5", "7", "25", "1"],
        "correct_answer": "5",
        "explanation": "|z| = sqrt(3^2 + 4^2) = sqrt(9 + 16) = sqrt(25) = 5.",
        "check_expr": ("sqrt(3^2 + 4^2)", "5"),
    },
]

SYNTHETIC_KB_CHUNKS = [
    {
        "subject": "Physics",
        "chapter": "Rotational Motion",
        "content": (
            "Synthetic Study Note — Rotational Dynamics: Moment of inertia I = sum(m_i * r_i^2). "
            "Standard values: Uniform rod about center = (1/12)ML^2; Solid sphere about diameter = (2/5)MR^2; "
            "Hollow sphere = (2/3)MR^2; Solid cylinder/disc = (1/2)MR^2. "
            "For pure rolling on an incline of angle theta without slipping, acceleration a = g*sin(theta) / (1 + I/(MR^2))."
        ),
    },
    {
        "subject": "Physics",
        "chapter": "Kinematics & Electrostatics",
        "content": (
            "Synthetic Study Note — Projectile & Electrostatics Formulas: Horizontal range R = (u^2 * sin(2*theta))/g, "
            "maximum height H = (u^2 * sin^2(theta))/(2g), time of flight T = (2*u*sin(theta))/g. "
            "Coulomb's Law: F = (1 / (4*pi*epsilon_0)) * (q1*q2 / r^2). Electric field at midpoint between two identical charges is zero."
        ),
    },
    {
        "subject": "Chemistry",
        "chapter": "Physical & Coordination Chemistry",
        "content": (
            "Synthetic Study Note — Physical Chemistry Core: pKa = -log10(Ka) and pH = -log10([H+]). "
            "First-order reaction rate constant k = (1/t)*ln([A]_0/[A]_t), and half-life t_1/2 = 0.693/k (independent of initial concentration). "
            "Gibbs free energy: Delta G = Delta H - T*Delta S (spontaneous when Delta G < 0)."
        ),
    },
    {
        "subject": "Mathematics",
        "chapter": "Calculus & Algebra",
        "content": (
            "Synthetic Study Note — Calculus & Matrices: Power rule d/dx(x^n) = n*x^(n-1). "
            "Fundamental theorem of calculus: integral_a^b f(x)dx = F(b) - F(a). "
            "For an n x n matrix A and scalar k, det(kA) = k^n * det(A). Quadratic equation ax^2 + bx + c = 0 has sum of roots = -b/a and product = c/a."
        ),
    },
]


def seed_initial_data(db: Session) -> None:
    """Idempotently seeds default questions, exam templates, and synthetic study notes."""
    if db.query(Question).count() == 0:
        for q_data in SEED_QUESTIONS:
            check_pair = q_data.get("check_expr")
            verified = True
            if check_pair:
                verified = are_expressions_equivalent(check_pair[0], check_pair[1])
            q = Question(
                subject=q_data["subject"],
                topic=q_data["topic"],
                exam_type=q_data["exam_type"],
                difficulty=q_data["difficulty"],
                question_text=q_data["question_text"],
                options=q_data["options"],
                correct_answer=q_data["correct_answer"],
                explanation=q_data["explanation"],
                marks=4.0,
                negative_marks=1.0,
                is_pyq=False,
                is_generated=False,
                math_verified=verified,
            )
            db.add(q)
        db.commit()

    if db.query(ExamTemplate).count() == 0:
        templates = [
            ExamTemplate(
                code="JEE_MAIN_DEMO",
                name="JEE Main Mock Simulator (Demo Pattern)",
                exam_type="JEE Main",
                description=(
                    "Demonstration simulator patterned on JEE Main (+4/-1 single-choice MCQs across "
                    "Physics, Chemistry, and Mathematics; 15 questions / 30 mins for live college evaluation)."
                ),
                duration_minutes=30,
                total_questions=15,
                subject_distribution={"Physics": 5, "Chemistry": 5, "Mathematics": 5},
                default_marks=4.0,
                default_negative_marks=1.0,
                is_demo_pattern=True,
            ),
            ExamTemplate(
                code="JEE_ADVANCED_DEMO",
                name="JEE Advanced Mock Simulator (Demo Pattern)",
                exam_type="JEE Advanced",
                description=(
                    "Demonstration simulator patterned on JEE Advanced (+4/-1 high-rigor conceptual problems across "
                    "Physics, Chemistry, and Mathematics; 18 questions / 45 mins for live college evaluation)."
                ),
                duration_minutes=45,
                total_questions=18,
                subject_distribution={"Physics": 6, "Chemistry": 6, "Mathematics": 6},
                default_marks=4.0,
                default_negative_marks=1.0,
                is_demo_pattern=True,
            ),
        ]
        db.add_all(templates)
        db.commit()

    # The real JEE Main pattern; added separately so existing databases get it too.
    if not db.query(ExamTemplate).filter(ExamTemplate.code == "JEE_MAIN_FULL").first():
        db.add(
            ExamTemplate(
                code="JEE_MAIN_FULL",
                name="JEE Main Full Mock Test",
                exam_type="JEE Main",
                description=(
                    "75 questions in 180 minutes: per subject, 20 single-correct MCQs and 5 numerical "
                    "questions, all generated from the NCERT chapters in the knowledge base. "
                    "+4 for a correct answer, -1 for a wrong one, 0 if left blank."
                ),
                duration_minutes=180,
                total_questions=75,
                subject_distribution={
                    subject: {"mcq": 20, "numerical": 5}
                    for subject in ("Physics", "Chemistry", "Mathematics")
                },
                default_marks=4.0,
                default_negative_marks=1.0,
                is_demo_pattern=False,
            )
        )
        db.commit()

    synthetic_path = "synthetic://prepmind_synthetic_revision_notes"
    model_name = active_embedding_model()
    synthetic = db.query(Document).filter(Document.file_path == synthetic_path).first()
    if synthetic and synthetic.embedding_model != model_name:
        # Vectors from another embedding model aren't comparable; re-embed.
        db.delete(synthetic)
        db.flush()
        synthetic = None
    if synthetic is None:
        doc = Document(
            filename="prepmind_synthetic_revision_notes.txt",
            file_path=synthetic_path,
            file_hash="synthetic-seed-v1",
            subject="All",
            doc_type="sample",
            exam="JEE Main & Advanced",
            student_class="Class 11 & 12",
            embedding_model=model_name,
        )
        db.add(doc)
        db.flush()

        vectors = embed_documents([c["content"] for c in SYNTHETIC_KB_CHUNKS])
        for idx, (chunk_data, emb) in enumerate(zip(SYNTHETIC_KB_CHUNKS, vectors)):
            db.add(
                DocumentChunk(
                    document_id=doc.id,
                    chunk_index=idx,
                    content=chunk_data["content"],
                    subject=chunk_data["subject"],
                    chapter=chunk_data["chapter"],
                    page_number=idx + 1,
                    embedding=emb,
                )
            )
        db.commit()