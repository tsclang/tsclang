#include "runtime.h"

typedef struct { int _dummy; } Hal;

static void Hal_avrOnly(const Hal *self) {
    printf("avr\n");
}

static void Hal_common(const Hal *self) {
    printf("common\n");
}

int main(void) {
    TSC_INIT();
    return 0;
}
