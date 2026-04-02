#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello world");
    const String sub = {.data = s.data + 6, .length = s.length - 6, .capacity = 0};
    printf("%.*s\n", (int)sub.length, sub.data);
    return 0;
}
