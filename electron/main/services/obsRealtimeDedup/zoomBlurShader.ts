export const ZOOM_BLUR_SHADER = `
uniform int samples <
  string label = "Samples";
  string widget_type = "slider";
  int minimum = 0;
  int maximum = 100;
  int step = 1;
> = 32;

uniform float magnitude <
  string label = "Magnitude";
  string widget_type = "slider";
  float minimum = 0.0;
  float maximum = 1.0;
  float step = 0.001;
> = 0.5;

uniform int speed_percent <
  string label = "Speed percent";
  string widget_type = "slider";
  int minimum = 0;
  int maximum = 100;
  int step = 1;
> = 0;

uniform bool ease;
uniform bool glitch;

float EaseInOutCircTimer(float t, float b, float c, float d) {
  t /= d / 2;
  if (t < 1) return -c / 2 * (sqrt(1 - t * t) - 1) + b;
  t -= 2;
  return c / 2 * (sqrt(1 - t * t) + 1) + b;
}

float Styler(float t, float b, float c, float d, bool shouldEase) {
  if (shouldEase) return EaseInOutCircTimer(t, 0, c, d);
  return t / 2.0;
}

float4 mainImage(VertData v_in) : TARGET {
  float4 c0 = image.Sample(textureSampler, v_in.uv);
  if (magnitude == 0.0 || samples <= 1) return c0;

  float speed = speed_percent * 0.01;
  float t = 1.0 + sin(elapsed_time * speed);
  if (glitch) t = clamp(t + ((rand_f * 2) - 1), 0.0, 2.0);
  float animationFactor = Styler(t, 0.0, 2.0, 2.0, ease);

  float PI = 3.1415926535897932384626433832795;
  float xTrans = (v_in.uv.x * 2) - 1;
  float yTrans = 1 - (v_in.uv.y * 2);
  float angle = atan(yTrans / xTrans) + PI;
  if (sign(xTrans) == 1) angle += PI;
  float radius = sqrt(pow(xTrans, 2) + pow(yTrans, 2));

  float4 accumulatedColor = c0;
  int fixed_samples = max(samples, 1);
  for (int i = 1; i < fixed_samples; i++) {
    float currentRadius = max(
      0,
      radius - (radius / 1000 * i * magnitude * 1.5 * animationFactor)
    );
    float2 currentCoord;
    currentCoord.x = (currentRadius * cos(angle) + 1.0) / 2.0;
    currentCoord.y = -1 * ((currentRadius * sin(angle) - 1.0) / 2.0);
    accumulatedColor += image.Sample(textureSampler, currentCoord);
  }

  accumulatedColor /= float(fixed_samples + 1);
  accumulatedColor = clamp(accumulatedColor, 0.0, 1.0);
  accumulatedColor.a = 1.0;
  return accumulatedColor;
}
`
