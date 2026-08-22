<?php
/**
 * Rule-based fallback "LLM" so the whole pipeline (rate limit → cache →
 * sanity check → Layout Engine → render) works end-to-end with ZERO
 * external API key configured. This is NOT a replacement for a real LLM —
 * it's a keyword-matching stand-in that produces the same tool-call JSON
 * shape a real model would (SDD 3.1/4), so you can develop and demo the
 * rest of the app before wiring a Claude/OpenAI key. Swap PROVIDER to
 * 'claude' or 'openai' in config/secrets.php once you have a key.
 */

final class MockNLU
{
    private const KEYWORDS = [
        'tree' => ['pohon', 'tree', 'trees'],
        'rock' => ['batu', 'rock', 'boulder'],
        'flower_bush' => ['bunga', 'flower', 'semak', 'bush'],
        'mountain' => ['gunung', 'mountain'],
        'pond' => ['kolam', 'pond', 'danau', 'lake'],
        'bench' => ['bangku', 'bench'],
        'fountain' => ['air mancur', 'fountain'],
        'lamp' => ['lampu', 'lamp', 'lantern'],
        'gazebo' => ['gazebo', 'pendopo'],
        'house' => ['rumah', 'house', 'cottage', 'cabin', 'kabin'],
        'wall' => ['tembok', 'wall', 'pagar', 'fence'],
        'path' => ['jalan setapak', 'path', 'trail'],
        'car' => ['mobil', 'car'],
        'cloud' => ['awan', 'cloud'],
        'campfire' => ['api unggun', 'campfire', 'bonfire'],
        'building' => ['gedung', 'building', 'skyscraper', 'tower', 'apartemen', 'apartment', 'kantor', 'office'],
        'terrain' => ['bukit', 'terrain', 'hill', 'tanah lapang', 'lahan'],
    ];

    private const COLOR_WORDS = [
        'red' => ['merah', 'red'], 'blue' => ['biru', 'blue'], 'green' => ['hijau', 'green'],
        'yellow' => ['kuning', 'yellow'], 'white' => ['putih', 'white'], 'black' => ['hitam', 'black'],
        'pink' => ['pink', 'merah muda'], 'purple' => ['ungu', 'purple'],
    ];

    /**
     * @param string $prompt free-text prompt
     * @param array $sceneSummary current scene state summary [{id, card, params}]
     * @return array ['calls' => [...]]
     */
    public static function generate(string $prompt, array $sceneSummary = []): array
    {
        $text = mb_strtolower($prompt);
        $calls = [];
        $existingByCard = [];
        foreach ($sceneSummary as $e) {
            $existingByCard[$e['card']][] = $e['id'];
        }

        // handle simple remove intent: "hapus <card>" / "remove <card>"
        $isRemove = (bool) preg_match('/\b(hapus|remove|delete|hilangkan)\b/', $text);

        $matchedAny = false;
        foreach (self::KEYWORDS as $card => $words) {
            foreach ($words as $w) {
                if (mb_strpos($text, $w) !== false) {
                    $matchedAny = true;
                    if ($isRemove) {
                        foreach ($existingByCard[$card] ?? [] as $id) {
                            $calls[] = ['action' => 'remove', 'id' => $id];
                        }
                        break;
                    }

                    // count, e.g. "3 pohon" / "tiga pohon"
                    $count = self::extractCount($text, $w);
                    $params = self::extractParams($card, $text);

                    $existingId = $existingByCard[$card][0] ?? null;
                    if ($existingId && $count === 1 && !preg_match('/\b(tambah|add|another|lagi)\b/', $text)) {
                        // treat as modify of the existing one when no "add another" language
                        $calls[] = ['action' => 'modify', 'id' => $existingId, 'params' => $params];
                    } else {
                        for ($i = 0; $i < $count; $i++) {
                            $suffix = count($existingByCard[$card] ?? []) + $i + 1;
                            $id = $card . '_' . $suffix;
                            $call = ['action' => 'add', 'card' => $card, 'id' => $id, 'params' => $params];
                            if ($count > 1) {
                                $call['relation'] = ['position' => 'scattered_around', 'offset' => 2.5];
                            } elseif (!empty($calls)) {
                                $lastAdd = null;
                                foreach (array_reverse($calls) as $prev) {
                                    if (($prev['action'] ?? '') === 'add') { $lastAdd = $prev; break; }
                                }
                                if ($lastAdd) {
                                    $call['relation'] = ['to' => $lastAdd['id'], 'position' => 'beside', 'offset' => 2];
                                }
                            }
                            $calls[] = $call;
                        }
                    }
                    break;
                }
            }
        }

        if (!$matchedAny && !$isRemove) {
            // Nothing recognized — default to a small starter scene so the
            // demo always produces *something* instead of an empty response.
            $calls[] = ['action' => 'add', 'card' => 'house', 'id' => 'house_1', 'params' => []];
            $calls[] = ['action' => 'add', 'card' => 'tree', 'id' => 'tree_1', 'params' => [],
                'relation' => ['to' => 'house_1', 'position' => 'beside', 'offset' => 2.5]];
            $calls[] = ['action' => 'add', 'card' => 'lamp', 'id' => 'lamp_1', 'params' => [],
                'relation' => ['to' => 'house_1', 'position' => 'in_front_of', 'offset' => 2]];
        }

        return ['calls' => $calls];
    }

    private static function extractCount(string $text, string $word): int
    {
        $numberWords = ['satu' => 1, 'dua' => 2, 'tiga' => 3, 'empat' => 4, 'lima' => 5,
            'one' => 1, 'two' => 2, 'three' => 3, 'four' => 4, 'five' => 5];
        // allow up to two adjective words between the number and the noun, e.g. "3 red trees"
        if (preg_match('/(\d+)\s*(?:\w+\s+){0,2}?' . preg_quote($word, '/') . '/u', $text, $m)) {
            return max(1, min(10, (int) $m[1]));
        }
        foreach ($numberWords as $w => $n) {
            if (preg_match('/\b' . $w . '\b\s*(?:\w+\s+){0,2}?' . preg_quote($word, '/') . '/u', $text)) {
                return $n;
            }
        }
        return 1;
    }

    private static function extractParams(string $card, string $text): array
    {
        $params = [];
        foreach (self::COLOR_WORDS as $colorKey => $words) {
            foreach ($words as $w) {
                if (mb_strpos($text, $w) !== false) {
                    if ($card === 'car') $params['color'] = $colorKey;
                    elseif ($card === 'flower_bush') $params['flower_color'] = $colorKey;
                    elseif (in_array($colorKey, ['green', 'autumn_orange', 'dead_brown']) && $card === 'tree') $params['leaf_color'] = $colorKey;
                    break;
                }
            }
        }
        if (mb_strpos($text, 'besar') !== false || mb_strpos($text, 'large') !== false || mb_strpos($text, 'big') !== false) {
            $params['size'] = 2;
        }
        if (mb_strpos($text, 'kecil') !== false || mb_strpos($text, 'small') !== false) {
            $params['size'] = 0.6;
        }
        if (($card === 'lamp') && (mb_strpos($text, 'warm') !== false || mb_strpos($text, 'hangat') !== false)) {
            $params['glow_warm'] = true;
        }
        if ($card === 'building') {
            if (mb_strpos($text, 'kaca') !== false || mb_strpos($text, 'glass') !== false) $params['style'] = 'glass_blue';
            elseif (mb_strpos($text, 'beton') !== false || mb_strpos($text, 'concrete') !== false) $params['style'] = 'concrete';
            elseif (mb_strpos($text, 'bata') !== false || mb_strpos($text, 'brick') !== false) $params['style'] = 'brick_red';
            if (mb_strpos($text, 'tinggi') !== false || mb_strpos($text, 'tall') !== false) $params['height'] = 14;
        }
        if ($card === 'terrain') {
            if (mb_strpos($text, 'pasir') !== false || mb_strpos($text, 'sand') !== false) $params['surface'] = 'sand';
            elseif (mb_strpos($text, 'salju') !== false || mb_strpos($text, 'snow') !== false) $params['surface'] = 'snow';
            elseif (mb_strpos($text, 'batu') !== false || mb_strpos($text, 'rocky') !== false) $params['surface'] = 'rocky';
        }
        return $params;
    }
}
