/* Publications: edit this list to update the site.
   fields: title, authors (use * for equal contribution), venue, year, kind (conf|journal|preprint),
   topic (breast | privacy | seg), first (first/co-first author), badges[], arxiv, url, code
   id: anchor (#p-<id>) that the Research section links to.
   compact: shown as a short row (used for the 2024 challenge entries). */
window.PUBLICATIONS = [
  {
    "id": "fsg",
    "topic": "breast",
    "title": "Feature Space Guidance for Breast Cancer Classification in DCE-MRI",
    "authors": "B. Hamm, Y. Kirchhoff, M. Rokuss, M. Langenberg, C. Ulrich, T. Wald, J. Traub, K. Gotkowski, K. Maier-Hein",
    "venue": "MICCAI 2026", "year": 2026, "kind": "conf", "first": true,
    "badges": ["Main conference"],
    "arxiv": "2609.32555", "code": "https://github.com/MIC-DKFZ/CURIAtor"
  },
  {
    "id": "anguinus",
    "topic": "breast",
    "title": "Anguinus Sculpturae: Compositional Synthesis of Peak-Enhancement Breast DCE-MRI Scans",
    "authors": "B. Hamm, N. A. Disch, M. Rokuss, Y. Kirchhoff, C. Ulrich, K. Maier-Hein",
    "venue": "MAMA-SYNTH 2026", "year": 2026, "kind": "preprint", "first": true,
    "arxiv": "2609.33611"
  },
  {
    "id": "jbhi",
    "topic": "privacy",
    "title": "Efficient Privacy-Preserving Medical Cross-Silo Federated Learning",
    "authors": "B. Hamm, Y. Kirchhoff, M. Rokuss, P. Schader, P. Neher, S. Parampottupadam, …, K. Maier-Hein",
    "venue": "IEEE JBHI 2026", "year": 2026, "kind": "journal", "first": true,
    "url": "https://doi.org/10.1109/JBHI.2026.3740976", "code": "https://github.com/MIC-DKFZ/deki-smpc"
  },
  {
    "id": "voxtell",
    "topic": "seg",
    "title": "VoxTell: Free-Text Promptable Universal 3D Medical Image Segmentation",
    "authors": "M. Rokuss*, M. Langenberg*, Y. Kirchhoff, F. Isensee, B. Hamm, C. Ulrich, …, K. Maier-Hein",
    "venue": "CVPR 2026", "year": 2026, "kind": "conf",
    "arxiv": "2511.11450", "code": "https://github.com/MIC-DKFZ/VoxTell"
  },
  {
    "id": "longitrack",
    "topic": "seg",
    "title": "Exploiting Longitudinal Context in Clinician-Verified Interactive Lesion Tracking",
    "authors": "Y. Kirchhoff*, M. Rokuss*, D. P. Mertens, D. Füller, B. Hamm, A. Schreyer, O. Ritter, K. Maier-Hein",
    "venue": "MICCAI 2026", "year": 2026, "kind": "conf",
    "arxiv": "2605.23118", "code": "https://github.com/MIC-DKFZ/LongiTrack-napari"
  },
  {
    "id": "nninteractive-agent",
    "topic": "seg",
    "title": "nnInteractive Agent: General-Purpose AI Agents as 3D Image Annotators",
    "authors": "F. Isensee, C. U. Harsy, M. Rokuss, B. Hamm, P. Vollmuth, K. H. Maier-Hein",
    "venue": "arXiv 2026", "year": 2026, "kind": "preprint",
    "arxiv": "2610.31080", "code": "https://github.com/MIC-DKFZ/nninteractive-agent"
  },
  {
    "id": "nnfoundation",
    "topic": "seg",
    "title": "nnFoundation: 3D Foundation Models for Radiology",
    "authors": "C. U. Harsy*, T. Wald*, K. Gotkowski*, …, B. Hamm, …, F. Isensee, K. H. Maier-Hein",
    "venue": "arXiv 2026", "year": 2026, "kind": "preprint",
    "arxiv": "2609.26924"
  },
  {
    "id": "glow-fdg",
    "topic": "seg",
    "title": "GLOW-FDG: Generalized Cancer Lesion Whole-Body Segmentation Model for ¹⁸F-FDG-PET/CT",
    "authors": "M. Fritsak, M. Rokuss, H. S. Gabryś, Y. Kirchhoff, B. Hamm, S. M. Christ, …, S. Tanadini-Lang",
    "venue": "arXiv 2026", "year": 2026, "kind": "preprint",
    "arxiv": "2607.03931"
  },
  {
    "id": "monitoring",
    "topic": "privacy",
    "title": "An Open-Source Monitoring Framework for Data Exploration and Progress Tracking in Multi-Center Radiology Studies",
    "authors": "M. Bujotzek, J. Scherer, S. Denner, P. Neher, B. Hamm, L. Feineis, U. Akünal, …",
    "venue": "arXiv 2026", "year": 2026, "kind": "preprint",
    "arxiv": "2606.16861"
  },
  {
    "id": "meisenmeister",
    "topic": "breast",
    "title": "MeisenMeister: A Simple Two Stage Pipeline for Breast Cancer Classification on MRI",
    "authors": "B. Hamm, Y. Kirchhoff, M. Rokuss, K. Maier-Hein",
    "venue": "MICCAI 2025 Challenge", "year": 2025, "kind": "preprint", "first": true,
    "arxiv": "2510.27326", "code": "https://github.com/MIC-DKFZ/MeisenMeister"
  },
  {
    "id": "brainmets",
    "topic": "seg",
    "title": "Enhancing Deep Learning Methods for Brain Metastasis Detection through Cross-Technique Annotations on SPACE MRI",
    "authors": "B. Hamm*, T. Wald*, J. C. Holzschuh, R. El Shafie, A. Kudak, B. Kovacs, I. Pflüger, …, K. Maier-Hein",
    "venue": "Eur. Radiol. Exp. 2025", "year": 2025, "kind": "journal", "first": true,
    "url": "https://doi.org/10.1186/s41747-025-00554-5"
  },
  {
    "id": "breastdivider",
    "topic": "breast",
    "title": "Divide and Conquer: A Large-Scale Dataset and Model for Left-Right Breast MRI Segmentation",
    "authors": "B. Hamm*, M. Rokuss*, Y. Kirchhoff, K. Maier-Hein",
    "venue": "MICCAI 2025 WS", "year": 2025, "kind": "conf", "first": true,
    "arxiv": "2507.13830", "code": "https://github.com/MIC-DKFZ/BreastDivider"
  },
  {
    "id": "kaapana",
    "topic": "privacy",
    "title": "Kaapana: A Comprehensive Open-Source Platform for Integrating AI in Medical Imaging Research Environments",
    "authors": "Ü. Akünal, M. Bujotzek, S. Denner, B. Hamm, K. Kades, P. Schader, J. Scherer, …",
    "venue": "arXiv 2025", "year": 2025, "kind": "preprint",
    "arxiv": "2512.09644", "code": "https://github.com/kaapana/kaapana"
  },
  {
    "id": "nninteractive",
    "topic": "seg",
    "title": "nnInteractive: Redefining 3D Promptable Segmentation",
    "authors": "F. Isensee*, M. Rokuss*, L. Krämer*, S. Dinkelacker, A. Ravindran, F. Stritzke, B. Hamm, …, K. Maier-Hein",
    "venue": "arXiv 2025", "year": 2025, "kind": "preprint",
    "arxiv": "2503.08373", "code": "https://github.com/MIC-DKFZ/nnInteractive"
  },
  {
    "id": "inclusive-fl",
    "topic": "privacy",
    "title": "Inclusive Federated Learning Through Compliance-Weighted Noise Allocation in Healthcare AI",
    "authors": "S. Parampottupadam, M. Coşğun, S. Pati, M. Zenk, S. Roy, D. Bounias, …, B. Hamm, …",
    "venue": "arXiv 2025", "year": 2025, "kind": "preprint",
    "arxiv": "2505.22108"
  },
  {
    "id": "amos-mind", "compact": true,
    "topic": "seg",
    "title": "Efficient Cross-Modality Abdominal Organ Segmentation Using nnU-Net and MIND Descriptors",
    "authors": "Y. Kirchhoff, M. Rokuss, B. Hamm, A. Ravindran, C. Ulrich, K. Maier-Hein, …",
    "venue": "MICCAI 2024 Challenge", "year": 2024, "kind": "conf"
  },
  {
    "id": "openvino", "compact": true,
    "topic": "seg",
    "title": "Optimizing nnU-Net with OpenVINO for Fast CPU Inference in Abdominal Organ Segmentation",
    "authors": "Y. Kirchhoff, A. Ravindran, M. Rokuss, B. Hamm, C. Ulrich, K. Maier-Hein, …",
    "venue": "MICCAI 2024 Challenge", "year": 2024, "kind": "conf"
  },
  {
    "id": "pancancer", "compact": true,
    "topic": "seg",
    "title": "Efficient Pan-Cancer Lesion Segmentation from Partially Labeled Data with nnU-Net",
    "authors": "Y. Kirchhoff, M. Rokuss, B. Hamm, A. Ravindran, C. Ulrich, K. Maier-Hein, …",
    "venue": "MICCAI 2024 Challenge", "year": 2024, "kind": "conf"
  }
];
