"""AAC vocabulary: core words + drawable concrete nouns, grouped by Fitzgerald-key-style category."""

_GROUPS = {
    "people": "I you me he she we they mom dad baby friend teacher boy girl family grandma grandpa doctor",
    "actions": "want go stop eat drink play help like look open close give make sleep sit walk run jump read "
               "draw sing dance wash swim ride throw climb",
    "descriptors": "more big little hot cold fast slow happy sad wet dirty clean all done up down in out on off "
                   "red blue green yellow",
    "food": "apple banana pizza cookie milk water juice bread cheese egg carrot grapes strawberry ice_cream "
            "cake sandwich cereal orange watermelon",
    "things": "ball car book cup bed chair table toy phone shoe hat shirt train bike balloon doll blocks "
              "spoon bowl toothbrush crayon kite boat airplane clock door",
    "places": "house school park home bathroom kitchen beach store playground pool",
    "animals": "dog cat fish bird horse cow pig duck rabbit bear lion elephant frog butterfly",
    "social": "yes no please thank_you hello goodbye sorry my_turn",
    "feelings": "hurt sick tired hungry thirsty scared angry excited love",
    "nature": "sun moon star tree flower rain snow cloud",
}

VOCAB = [{"word": w.replace("_", " "), "category": "things" if cat == "nature" else cat}
         for cat, words in _GROUPS.items() for w in words.split()]

# Abstract core words don't draw well literally; map them to concrete, drawable scenes for SD prompts.
DEPICT = {
    "I": "a happy child pointing at their own chest",
    "you": "a hand pointing forward at the viewer",
    "me": "a happy child pointing at their own chest",
    "we": "a group of happy children holding hands",
    "they": "a group of people standing together",
    "want": "a child reaching out with both open hands",
    "more": "two hands bringing fingertips together, a plus sign",
    "help": "a grown-up hand lifting a child's hand, helping hands",
    "yes": "a big green check mark and a thumbs up",
    "no": "a big red X and a thumbs down",
    "stop": "a red octagon stop sign",
    "go": "a big green arrow pointing right",
    "like": "a thumbs up with a red heart",
    "all done": "two open empty hands, finished, empty plate",
    "up": "a big arrow pointing up",
    "down": "a big arrow pointing down",
    "in": "a red ball inside a box",
    "out": "a red ball outside a box",
    "on": "a light switch turned on with a glowing bulb",
    "off": "a light switch turned off with a dark bulb",
    "please": "a child with hands pressed together, smiling",
    "thank you": "a smiling child with a hand on the heart",
    "hello": "a smiling child waving hello",
    "goodbye": "a child waving goodbye at a door",
    "sorry": "a sad child giving a hug",
    "my turn": "a child pointing at themself holding a toy",
    "happy": "a big smiling yellow face",
    "sad": "a sad face with a tear",
    "angry": "an angry red face",
    "scared": "a scared face with wide eyes",
    "tired": "a sleepy yawning face",
    "excited": "a child jumping with joy and arms up",
    "hurt": "a child with a bandage on the knee",
    "sick": "a child in bed with a thermometer",
    "hungry": "a child holding an empty bowl and spoon",
    "thirsty": "a child holding an empty glass",
    "love": "a big red heart",
    "big": "a big elephant next to a small mouse",
    "little": "a tiny mouse",
    "hot": "a steaming hot cup with red waves",
    "cold": "an ice cube with snowflakes",
    "fast": "a race car speeding with motion lines",
    "slow": "a snail",
    "done": "a big green check mark",
    "all": "a full basket of colorful balls",
}
