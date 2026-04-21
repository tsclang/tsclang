#include "runtime.h"

static uint16_t frameCount = 0U;

void onNmi(void) {
    frameCount++;
}

void gameLoop(void) {
    while (true) {
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
