// SPDX-License-Identifier: GPL-2.0-or-later
#include <emscripten.h>
#include <stdint.h>

#include "doomgeneric.h"

#define TICS_PER_SECOND 35
#define KEY_QUEUE_SIZE 64

static uint32_t clock_ms;
static uint32_t tic;
static uint16_t keys[KEY_QUEUE_SIZE];
static unsigned keys_read;
static unsigned keys_written;
static uint32_t rgba[DOOMGENERIC_RESX * DOOMGENERIC_RESY];

void DG_Init(void) {}
void DG_DrawFrame(void) {}
void DG_SetWindowTitle(const char *title) { (void)title; }
void DG_SleepMs(uint32_t ms) { clock_ms += ms; }
uint32_t DG_GetTicksMs(void) { return clock_ms; }

int DG_GetKey(int *pressed, unsigned char *key) {
  if (keys_read == keys_written) return 0;
  uint16_t entry = keys[keys_read++ % KEY_QUEUE_SIZE];
  *pressed = entry >> 8;
  *key = entry & 0xff;
  return 1;
}

EMSCRIPTEN_KEEPALIVE void site_start(void) {
  static char *argv[] = {"doom", "-iwad", "/freedoom1.wad", "-warp", "1", "1", "-skill", "3", "-nomusic", "-nosfx", "-mb", "32"};
  doomgeneric_Create(sizeof argv / sizeof *argv, argv);
}

EMSCRIPTEN_KEEPALIVE void site_tick(void) {
  tic++;
  clock_ms = (uint32_t)((uint64_t)tic * 1000 / TICS_PER_SECOND + 1);
  doomgeneric_Tick();
}

EMSCRIPTEN_KEEPALIVE void site_key(int pressed, int key) {
  if (keys_written - keys_read == KEY_QUEUE_SIZE) return;
  keys[keys_written++ % KEY_QUEUE_SIZE] = (uint16_t)((pressed ? 1 : 0) << 8 | (key & 0xff));
}

EMSCRIPTEN_KEEPALIVE uint8_t *site_rgba(void) {
  for (int i = 0; i < DOOMGENERIC_RESX * DOOMGENERIC_RESY; i++) {
    uint32_t bgr = DG_ScreenBuffer[i];
    rgba[i] = 0xff000000u | (bgr & 0xff) << 16 | (bgr & 0xff00) | (bgr >> 16 & 0xff);
  }
  return (uint8_t *)rgba;
}
