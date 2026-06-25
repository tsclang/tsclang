#include "runtime.h"

typedef struct { int _dummy; } Hal;

static void Hal_avrOnly(const Hal *self) {
    (void)self;
    printf("avr\n");
}

static void Hal_common(const Hal *self) {
    (void)self;
    printf("common\n");
}

int main(void) {
    TSC_INIT();
    return 0;
}
