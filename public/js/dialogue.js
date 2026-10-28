import { pick } from './util.js';
import { api } from './api.js';

const L = {
  crow: {
    greet: ['Caw. You\'re new. The whole block has been talking about you.', 'Hey, cousin. Fellow wild thing! Got any scraps?', 'Ah, the gray one with the hat. Word travels fast on wires.'],
    chat: ['Humans drop the best things when they\'re yelling. Remember that.', 'I know every dumpster from here to the water. Ask nicely.', 'Rain makes the worms stupid. Good days for crows.'],
    news: ['I hear things. Markets, picnics, open doors. Ask and I\'ll check the wires.', 'Everything interesting happens near the strip, if you know when to look.'],
    trade: ['A scrap for a look around? Fair. I fly, you eat. Everybody wins.', 'Deal. Give me a moment and I\'ll tell you who\'s lurking where.'],
    help: ['Stay out of the road. Stay out of the helicopters. Everything else is negotiable.'],
    bye: ['Caw. Don\'t get caught.', 'Fly safe — well, trot safe.'],
  },
  cat: {
    greet: ['Hm. You\'re big for a dog.', '*slow blink* I allow this.', 'This is my fence. You may look at it.'],
    chat: ['The humans feed me twice. Each of them thinks they\'re the only one.', 'I have been awake for six hours. I plan to sleep for twelve.', 'Foxes are too chatty. Coyotes are the right amount.'],
    friend: ['Run with you? Perhaps. If there\'s food in it.', 'Fine. But I walk where I like.'],
    help: ['Warm spots. Dry spots. That\'s all you need to know.'],
    bye: ['Mrrp. Go away now.', '*turns around*'],
  },
  fox: {
    greet: ['Well, well. A coyote in the hills. How terribly interesting.', 'Evening. Mind the blackberries — they bite back.'],
    chat: ['I know a creek where the rabbits don\'t look up. Maybe I\'ll tell you.', 'The wizard\'s biscuits are overrated. The witch\'s garden snacks are not.'],
    friend: ['A pack? I\'m more of a clever-solo type. But for the right trouble, I\'ll tag along.', 'You have good manners. Lead on.'],
    help: ['Never hunt a deer alone. Never. They look polite until they kick.'],
    bye: ['Until the next moonrise.', 'Tail high, friend.'],
  },
  sealion: {
    greet: ['*HRRRRNK* ...yes?', 'Mmmph. Sand is warm. Do not ruin it.', 'You\'re standing in my light.'],
    chat: ['The tide comes. The tide goes. I stay.', 'Fish used to jump into my mouth. Now they\'re smarter.', 'You are small and loud. I find that tolerable.'],
    help: ['Advice: don\'t touch me. Also: don\'t touch me.'],
    bye: ['*dramatic sigh*', 'HRRRNK. Go.'],
  },
  wizard: {
    greet: ['Ah! A coyote with a bowler hat. How delightfully correct.', 'Welcome, welcome. The biscuits are warm and the wind is kind.'],
    chat: ['Lavender Hill has a lot of lovely strangeness. I only add to it.', 'The moon is in a good mood tonight. Or I made that up.'],
    news: ['Picnics in the park around midday, markets with brooms in the morning. The usual wizardry.'],
    treat: ['Here — a biscuit, fresh from my sleeve. Don\'t tell the squirrels.', 'One treat, as ordered. Eat slowly. Or don\'t.'],
    bye: ['Safe paths, little wanderer.', 'May your bins always be full.'],
  },
  witch: {
    greet: ['Hello, dear! Mind the cauldron, it bites.', 'A coyote at my door! Lovely. I was running out of visitors.'],
    chat: ['The blackberries here are enchanted. Mildly. They make you smug.', 'Ten seconds of flight is plenty. Any longer and you\'d get ideas.'],
    magic: ['Take this — a little flight spell. Ten seconds of sky. Spend it wisely.', 'A pinch of wind, a drop of moon. There. Up you go, when you\'re ready.'],
    bye: ['Fly well, little one!', 'Come back when the moon\'s fuller.'],
  },
  pumpkin: {
    greet: ['BOO! ...oh, you\'re not scared. Rats.', 'Jack\'s the name, scaring\'s the game! And you are?', 'Hee hee! Fellow nighttime creature!'],
    chat: ['Humans scream in the most wonderful pitches. Especially in coffee shops.', 'My legs are new. I am very proud of them.', 'Candle inside, joy outside. That\'s my whole philosophy.'],
    help: ['Let\'s scare someone! You growl, I\'ll yell BOO. Ready?'],
    bye: ['Boo-bye!', 'Keep it spooky!'],
  },
  dog: {
    greet: ['*sniff sniff* NEW FRIEND?!', 'You smell like the woods! I love the woods!'],
    friend: ['*wiggles* Yes yes yes!', 'Pets! No wait, you\'re a coyote. Even better!'],
    bye: ['*bark*'],
  },
  coyote: {
    friend: ['You read the signs right. I\'ll run with you.', 'Fine. The hill is better with more voices.', 'Good manners, quiet feet. Let\'s go find supper.'],
    greet: ['Hm.'], chat: ['Hm.'], bye: ['Hm.'],
  },
};

export function defaultLine(speaker, topic) {
  const t = L[speaker] || L.crow;
  return pick(t[topic] || t.chat || t.greet || ['...']);
}

export async function speak(speaker, topic, ctx, message) {
  try {
    const r = await api.dialogue(speaker, topic, ctx, message);
    if (r && r.text) return { text: r.text, source: 'ai' };
  } catch (e) { /* fall through to built-in lines */ }
  return { text: defaultLine(speaker, topic), source: 'default' };
}
