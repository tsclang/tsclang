#include "runtime.h"

typedef enum { Dir_north, Dir_south } Dir;
static const char *Dir_values[] = { "north", "south" };

int main(void) {
    TSC_INIT();
    const Dir d = Dir_south;
    const String s = STR_LIT_RUNTIME(Dir_values[(int)d]);
    printf("%s\n", s.data);
    return 0;
}
