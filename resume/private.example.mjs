export const phone = "(555) 555-5555";

// Names that must never appear in the public résumé data. src/data/resume.test.ts checks them.
export const banned = ["ExampleCustomer"];

// Folder holding the licensed résumé fonts (Futura PT, Le Monde Livre). RESUME_FONTS overrides it.
// Without them the PDF falls back to Jost and Source Serif.
export const fonts = "/path/to/fonts";
