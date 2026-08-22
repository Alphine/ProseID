<?php
/**
 * Server-side reader for the Card Catalog — used for the sanity-check
 * whitelist (SDD 3.3e) and by the mock NLU fallback. Loads the same
 * data/card_catalog.json that js/cardCatalog.js fetches client-side, so
 * there is exactly one hand-maintained card list, not two that can drift.
 */

final class CardCatalog
{
    private static ?array $cards = null;

    /** @return array<int, array{name:string, category:string, description:string, icon:string, parameters:array}> */
    public static function all(): array
    {
        if (self::$cards === null) {
            $path = __DIR__ . '/../../data/card_catalog.json';
            $decoded = json_decode(file_get_contents($path), true);
            if (!is_array($decoded) || !isset($decoded['cards'])) {
                throw new RuntimeException("Card catalog JSON at {$path} is missing or malformed.");
            }
            self::$cards = $decoded['cards'];
        }
        return self::$cards;
    }

    /** @return string[] */
    public static function validCardNames(): array
    {
        return array_map(static fn(array $c) => $c['name'], self::all());
    }

    public static function isValid(string $card): bool
    {
        return in_array($card, self::validCardNames(), true);
    }

    public static function find(string $card): ?array
    {
        foreach (self::all() as $c) {
            if ($c['name'] === $card) return $c;
        }
        return null;
    }

    /**
     * Distinct category values across the catalog (Nature, Props,
     * Architecture, Vehicles, Effects, ...) — the dimension the two-stage
     * categorization flow (SDD 3.1 caveat) filters on. Reuses the same
     * `category` field the UI already groups cards by, rather than
     * inventing a second taxonomy.
     * @return string[]
     */
    public static function categories(): array
    {
        return array_values(array_unique(array_map(static fn(array $c) => $c['category'], self::all())));
    }

    /**
     * Card names belonging to any of the given categories. Falls back to
     * every card name if $categories is empty/unrecognized, so a caller
     * that gets nothing usable back from stage 1 still works — just
     * without the accuracy benefit of narrowing the catalog.
     * @param string[] $categories
     * @return string[]
     */
    public static function namesInCategories(array $categories): array
    {
        $valid = array_intersect($categories, self::categories());
        if (empty($valid)) {
            return self::validCardNames();
        }
        return array_values(array_map(
            static fn(array $c) => $c['name'],
            array_filter(self::all(), static fn(array $c) => in_array($c['category'], $valid, true))
        ));
    }
}
