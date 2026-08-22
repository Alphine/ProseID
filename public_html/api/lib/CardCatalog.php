<?php
/**
 * Server-side mirror of js/cardCatalog.js — used for the sanity-check
 * whitelist (SDD 3.3e) and by the mock NLU fallback. Keep card names in
 * sync with the client catalog.
 */

final class CardCatalog
{
    /** @return string[] */
    public static function validCardNames(): array
    {
        return [
            'tree', 'rock', 'flower_bush', 'mountain', 'pond',
            'bench', 'fountain', 'lamp', 'gazebo', 'house',
            'wall', 'path', 'car', 'cloud', 'campfire',
            'building', 'terrain',
        ];
    }

    public static function isValid(string $card): bool
    {
        return in_array($card, self::validCardNames(), true);
    }
}
