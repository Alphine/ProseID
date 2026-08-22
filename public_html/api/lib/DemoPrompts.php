<?php
/**
 * Curated demo prompts — SDD 3.3f "demo-reliability cache". These are
 * pre-computed manually (not derived from live traffic) so the "✨ Try These
 * Prompts" buttons in the UI ALWAYS work, even if the LLM API is down
 * during judging. Served directly from this class (generate.php calls
 * DemoPrompts::find() for the demoKey path) rather than through the
 * SceneCache/'curated_demo' table — that column exists on SceneCache but
 * nothing currently writes to it; this class is the actual source of truth.
 */

final class DemoPrompts
{
    /** @return array<string, array{label: string, calls: array}> */
    public static function all(): array
    {
        return [
            'cozy_park' => [
                'label' => 'Cozy park at sunset',
                'prompt' => 'Create a small cozy park at sunset with a fountain, benches, and trees.',
                'calls' => [
                    ['action' => 'add', 'card' => 'fountain', 'id' => 'fountain_1', 'params' => ['size' => 1.5, 'tiers' => 2]],
                    ['action' => 'add', 'card' => 'bench', 'id' => 'bench_1', 'params' => ['material' => 'wood'],
                        'relation' => ['to' => 'fountain_1', 'position' => 'beside', 'offset' => 2.5]],
                    ['action' => 'add', 'card' => 'bench', 'id' => 'bench_2', 'params' => ['material' => 'wood'],
                        'relation' => ['to' => 'fountain_1', 'position' => 'behind', 'offset' => 2.5]],
                    ['action' => 'add', 'card' => 'tree', 'id' => 'tree_1', 'params' => ['height' => 3],
                        'relation' => ['to' => 'fountain_1', 'position' => 'in_front_of', 'offset' => 3.5]],
                    ['action' => 'add', 'card' => 'tree', 'id' => 'tree_2', 'params' => ['height' => 2.5],
                        'relation' => ['position' => 'scattered_around', 'offset' => 4]],
                    ['action' => 'add', 'card' => 'tree', 'id' => 'tree_3', 'params' => ['height' => 2.8],
                        'relation' => ['position' => 'scattered_around', 'offset' => 4]],
                    ['action' => 'add', 'card' => 'lamp', 'id' => 'lamp_1', 'params' => ['style' => 'street', 'glow_warm' => true],
                        'relation' => ['to' => 'fountain_1', 'position' => 'beside', 'offset' => 4]],
                    ['action' => 'add', 'card' => 'flower_bush', 'id' => 'flower_1', 'params' => ['flower_color' => 'pink'],
                        'relation' => ['to' => 'bench_1', 'position' => 'beside', 'offset' => 1.5]],
                ],
            ],
            'mountain_cabin' => [
                'label' => 'Mountain cabin in the snow',
                'prompt' => 'A cozy mountain cabin in the snow with pine trees around it.',
                'calls' => [
                    ['action' => 'add', 'card' => 'mountain', 'id' => 'mountain_1', 'params' => ['height' => 8, 'snow_capped' => true],
                        'relation' => ['position' => 'scattered_around', 'offset' => 10]],
                    ['action' => 'add', 'card' => 'house', 'id' => 'house_1', 'params' => ['wall_color' => 'wood_brown', 'roof_color' => 'slate_gray', 'chimney' => true]],
                    ['action' => 'add', 'card' => 'tree', 'id' => 'tree_1', 'params' => ['height' => 3, 'leaf_color' => 'green'],
                        'relation' => ['to' => 'house_1', 'position' => 'beside', 'offset' => 3]],
                    ['action' => 'add', 'card' => 'tree', 'id' => 'tree_2', 'params' => ['height' => 3.2, 'leaf_color' => 'green'],
                        'relation' => ['to' => 'house_1', 'position' => 'behind', 'offset' => 3]],
                    ['action' => 'add', 'card' => 'lamp', 'id' => 'lamp_1', 'params' => ['style' => 'lantern', 'glow_warm' => true],
                        'relation' => ['to' => 'house_1', 'position' => 'in_front_of', 'offset' => 2]],
                ],
            ],
            'tropical_beach' => [
                'label' => 'Tropical beach with a hut',
                'prompt' => 'Tropical beach with a hut, a campfire, and a pond nearby.',
                'calls' => [
                    ['action' => 'add', 'card' => 'gazebo', 'id' => 'gazebo_1', 'params' => ['size' => 3.5]],
                    ['action' => 'add', 'card' => 'campfire', 'id' => 'campfire_1', 'params' => ['size' => 1],
                        'relation' => ['to' => 'gazebo_1', 'position' => 'in_front_of', 'offset' => 3]],
                    ['action' => 'add', 'card' => 'pond', 'id' => 'pond_1', 'params' => ['radius' => 2.5, 'water_color' => 'teal'],
                        'relation' => ['to' => 'gazebo_1', 'position' => 'beside', 'offset' => 5]],
                    ['action' => 'add', 'card' => 'rock', 'id' => 'rock_1', 'params' => ['shape' => 'round'],
                        'relation' => ['to' => 'pond_1', 'position' => 'beside', 'offset' => 2]],
                ],
            ],
            'medieval_square' => [
                'label' => 'Medieval village square',
                'prompt' => 'A medieval village square with a house, a stone wall, and a street lamp.',
                'calls' => [
                    ['action' => 'add', 'card' => 'house', 'id' => 'house_1', 'params' => ['wall_color' => 'stone', 'roof_color' => 'dark_wood']],
                    ['action' => 'add', 'card' => 'wall', 'id' => 'wall_1', 'params' => ['length' => 5, 'material' => 'stone'],
                        'relation' => ['to' => 'house_1', 'position' => 'beside', 'offset' => 3]],
                    ['action' => 'add', 'card' => 'path', 'id' => 'path_1', 'params' => ['length' => 6, 'width' => 1.2],
                        'relation' => ['to' => 'house_1', 'position' => 'in_front_of', 'offset' => 3]],
                    ['action' => 'add', 'card' => 'lamp', 'id' => 'lamp_1', 'params' => ['style' => 'street'],
                        'relation' => ['to' => 'path_1', 'position' => 'beside', 'offset' => 1.5]],
                ],
            ],
            'futuristic_rooftop' => [
                'label' => 'Futuristic city rooftop',
                'prompt' => 'A futuristic city rooftop with clouds and a sports car parked.',
                'calls' => [
                    ['action' => 'add', 'card' => 'car', 'id' => 'car_1', 'params' => ['color' => 'blue', 'style' => 'sports']],
                    ['action' => 'add', 'card' => 'cloud', 'id' => 'cloud_1', 'params' => ['size' => 2.5],
                        'relation' => ['to' => 'car_1', 'position' => 'on_top_of', 'offset' => 4]],
                    ['action' => 'add', 'card' => 'cloud', 'id' => 'cloud_2', 'params' => ['size' => 2],
                        'relation' => ['position' => 'scattered_around', 'offset' => 6]],
                    ['action' => 'add', 'card' => 'lamp', 'id' => 'lamp_1', 'params' => ['style' => 'modern', 'glow_warm' => false],
                        'relation' => ['to' => 'car_1', 'position' => 'beside', 'offset' => 2.5]],
                ],
            ],
            'city_skyline' => [
                'label' => 'Downtown skyline',
                'prompt' => 'A downtown skyline with glass office buildings, a road, and a parked car.',
                'calls' => [
                    ['action' => 'add', 'card' => 'terrain', 'id' => 'terrain_1', 'params' => ['radius' => 6, 'surface' => 'rocky']],
                    ['action' => 'add', 'card' => 'building', 'id' => 'building_1', 'params' => ['height' => 12, 'style' => 'glass_blue']],
                    ['action' => 'add', 'card' => 'building', 'id' => 'building_2', 'params' => ['height' => 8, 'style' => 'concrete'],
                        'relation' => ['to' => 'building_1', 'position' => 'beside', 'offset' => 3.2]],
                    ['action' => 'add', 'card' => 'building', 'id' => 'building_3', 'params' => ['height' => 16, 'style' => 'brick_red'],
                        'relation' => ['to' => 'building_1', 'position' => 'behind', 'offset' => 3.2]],
                    ['action' => 'add', 'card' => 'path', 'id' => 'path_1', 'params' => ['length' => 8, 'width' => 2],
                        'relation' => ['to' => 'building_1', 'position' => 'in_front_of', 'offset' => 3.5]],
                    ['action' => 'add', 'card' => 'car', 'id' => 'car_1', 'params' => ['color' => 'black', 'style' => 'sedan'],
                        'relation' => ['to' => 'path_1', 'position' => 'beside', 'offset' => 1.5]],
                    ['action' => 'add', 'card' => 'lamp', 'id' => 'lamp_1', 'params' => ['style' => 'modern', 'glow_warm' => false],
                        'relation' => ['to' => 'path_1', 'position' => 'beside', 'offset' => 2.5]],
                ],
            ],
            'forest_camp' => [
                'label' => 'Forest camping site',
                'prompt' => 'A forest camping site with a campfire, trees, and rocks around.',
                'calls' => [
                    ['action' => 'add', 'card' => 'campfire', 'id' => 'campfire_1', 'params' => ['size' => 1.2]],
                    ['action' => 'add', 'card' => 'tree', 'id' => 'tree_1', 'params' => ['height' => 3.5],
                        'relation' => ['position' => 'scattered_around', 'offset' => 4]],
                    ['action' => 'add', 'card' => 'tree', 'id' => 'tree_2', 'params' => ['height' => 3],
                        'relation' => ['position' => 'scattered_around', 'offset' => 4]],
                    ['action' => 'add', 'card' => 'tree', 'id' => 'tree_3', 'params' => ['height' => 3.2],
                        'relation' => ['position' => 'scattered_around', 'offset' => 4]],
                    ['action' => 'add', 'card' => 'rock', 'id' => 'rock_1', 'params' => ['shape' => 'round'],
                        'relation' => ['to' => 'campfire_1', 'position' => 'beside', 'offset' => 1.8]],
                    ['action' => 'add', 'card' => 'rock', 'id' => 'rock_2', 'params' => ['shape' => 'angular'],
                        'relation' => ['to' => 'campfire_1', 'position' => 'behind', 'offset' => 1.8]],
                ],
            ],
        ];
    }

    public static function find(string $key): ?array
    {
        $all = self::all();
        return $all[$key] ?? null;
    }
}
