#include "runtime.h"

typedef enum { Dir_North = 0, Dir_South = 1, Dir_East = 2, Dir_West = 3 } Dir;
static const Dir Dir_values[] = { Dir_North, Dir_South, Dir_East, Dir_West };
static const char *Dir_names[] = { "North", "South", "East", "West" };
typedef struct { bool has_value; Dir value; } opt_Dir;

static inline opt_Dir Dir_fromValue(int32_t v) {
    for (int i = 0; i < 4; i++) { if ((int32_t)Dir_values[i] == v) return (opt_Dir){true, Dir_values[i]}; }
    return (opt_Dir){false, 0};
}

int main(void) {
    TSC_INIT();
    opt_Dir d = Dir_fromValue(2);
    printf("%d\n", d.has_value ? (int)d.value : -1);
    return 0;
}
