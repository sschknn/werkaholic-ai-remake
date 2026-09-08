export type AdOutput = {
  title: string;
  short_description: string;
  long_description: string;
  category: string;
  condition: string;
  price_text: string;
  price_value: number | null;
  tags: string[];
  confidence: number | null;
}
