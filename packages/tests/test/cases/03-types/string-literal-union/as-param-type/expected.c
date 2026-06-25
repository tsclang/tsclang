#include "runtime.h"

typedef enum { Dir_north, Dir_south, Dir_east, Dir_west } Dir;
static const char *Dir_values[] = { "north", "south", "east", "west" };

void move_Dir(Dir dir) {
    printf("%s\n", STR_LIT_RUNTIME(Dir_values[(int)dir]).data);
}

int main(void) {
    TSC_INIT();
    move_Dir(Dir_east);
    return 0;
}
